"""Synchronize reviewed S&P 100 membership without deleting historical data.

Run before price ingestion. Only reviewed index symbols (and obsolete HON) are
managed here; independently tracked equities, ETFs, and crypto are untouched.
"""
import os
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from tickers import (
    COMPANY_NAMES, SP100_ADDITIONS, SP100_ADDITION_METADATA, SP100_BASE_TICKERS,
    TRACKED_EQUITY_TICKERS, get_sp100_tickers,
)
from market_calendar import is_market_holiday, previous_market_day


def plan_sync(existing: list[dict], as_of: date | None = None) -> list[dict]:
    active = set(get_sp100_tickers(as_of)) | set(TRACKED_EQUITY_TICKERS)
    managed = set(SP100_BASE_TICKERS) | set(SP100_ADDITIONS) | {"HON"}
    by_ticker = {row["ticker"]: row for row in existing}
    changes = []
    for ticker in sorted(managed):
        previous = by_ticker.get(ticker)
        enabled = ticker in active
        if previous is None:
            if ticker == "HON":
                continue
            row = {"ticker": ticker, "name": COMPANY_NAMES[ticker], "is_active": enabled}
            if ticker in SP100_ADDITIONS:
                row["sector"] = "Information Technology"
                metadata = SP100_ADDITION_METADATA[ticker]
                row["exchange"] = metadata["exchange"]
                row["logo_url"] = f"https://icons.duckduckgo.com/ip3/{metadata['domain']}.ico"
            changes.append(row)
        elif previous["is_active"] != enabled:
            changes.append({"ticker": ticker, "is_active": enabled})
    return changes


def check_addition_readiness(client, existing: list[dict], as_of: date) -> None:
    """Fail before any membership write if replacement data is incomplete."""
    by_ticker = {row["ticker"]: row for row in existing}
    last_session = previous_market_day(as_of)
    cutoff = as_of - timedelta(days=366)
    for ticker in SP100_ADDITIONS:
        stock = by_ticker.get(ticker, {})
        if (not all(stock.get(key) for key in ("name", "sector", "exchange", "logo_url", "market_cap"))
                or not math.isfinite(float(stock["market_cap"])) or float(stock["market_cap"]) <= 0):
            raise RuntimeError(f"{ticker}: replacement metadata is incomplete")
        quotes = client.table("stock_prices").select("price,fetched_at").eq("ticker", ticker).execute().data
        if not quotes or not math.isfinite(float(quotes[0]["price"] or 0)) or float(quotes[0]["price"] or 0) <= 0:
            raise RuntimeError(f"{ticker}: replacement price is missing")
        fetched = datetime.fromisoformat(quotes[0]["fetched_at"].replace("Z", "+00:00"))
        # The last completed session's closing ingestion or newer is required.
        if fetched < datetime.combine(last_session, datetime.min.time(), ZoneInfo("America/New_York")).replace(hour=16):
            raise RuntimeError(f"{ticker}: replacement quote is stale")
        history = client.table("price_history_long").select("date,close").eq("ticker", ticker).gte("date", cutoff.isoformat()).order("date").execute().data
        dates = {row["date"][:10] for row in history}
        expected = {
            day.isoformat()
            for i in range((last_session - cutoff).days + 1)
            if (day := cutoff + timedelta(days=i)).weekday() < 5 and not is_market_holiday(day)
        }
        if (len(history) < 240 or not history
                or history[0]["date"][:10] > (cutoff + timedelta(days=7)).isoformat()
                or history[-1]["date"][:10] < last_session.isoformat()
                or expected - dates
                or any(not math.isfinite(float(row["close"] or 0)) or float(row["close"] or 0) <= 0 for row in history)):
            raise RuntimeError(f"{ticker}: replacement one-year history is incomplete")


def sync_sp100(client) -> int:
    # Capture one date for planning and verification; jobs started before the
    # cutoff cannot calculate two different universes within one sync.
    as_of = datetime.now(ZoneInfo("America/New_York")).date()
    fields = ("ticker", "name", "is_active", "exchange", "sector", "logo_url")
    existing = client.table("stocks").select(",".join((*fields, "market_cap"))).execute().data
    changes = plan_sync(existing, as_of)
    if any(row["ticker"] in SP100_ADDITIONS and row["is_active"] for row in changes):
        check_addition_readiness(client, existing, as_of)
    if changes:
        previous = {row["ticker"]: row for row in existing}
        rows = []
        for change in changes:
            row = {key: previous.get(change["ticker"], {}).get(key) for key in fields}
            row.update(change)
            rows.append(row)
        # A single PostgREST bulk upsert is one database transaction. All four
        # additions/removals commit together, or none do. Other stock fields
        # (including market caps) and all dependent user rows are untouched.
        client.table("stocks").upsert(rows, on_conflict="ticker").execute()
    actual = client.table("stocks").select("ticker,is_active").execute().data
    if plan_sync(actual, as_of):
        raise RuntimeError("S&P 100 membership verification failed")
    if changes:
        print("S&P 100 synchronized atomically: " + ", ".join(row["ticker"] for row in changes))
    return len(changes)


if __name__ == "__main__":
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")
    load_dotenv()
    client = create_client(
        os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    print(f"S&P 100 synchronized: {sync_sp100(client)} changes")
