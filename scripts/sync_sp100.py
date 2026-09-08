"""Synchronize reviewed S&P 100 membership without deleting historical data.

Run before price ingestion. Only reviewed index symbols (and obsolete HON) are
managed here; independently tracked equities, ETFs, and crypto are untouched.
"""
import os
from datetime import date
from pathlib import Path

from tickers import (
    COMPANY_NAMES, SP100_ADDITIONS, SP100_ADDITION_METADATA, SP100_BASE_TICKERS,
    TRACKED_EQUITY_TICKERS, get_sp100_tickers,
)


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


def sync_sp100(client) -> int:
    existing = client.table("stocks").select("ticker,is_active").execute().data
    changes = plan_sync(existing)
    # Enable/insert first, so a partial failure never disables the old universe
    # before the replacements exist. A retry completes any remaining changes.
    for row in sorted(changes, key=lambda row: not row["is_active"]):
        if "name" in row:
            client.table("stocks").upsert(row, on_conflict="ticker").execute()
        else:
            client.table("stocks").update({"is_active": row["is_active"]}).eq("ticker", row["ticker"]).execute()
        print(f"S&P 100 sync: {row['ticker']} active={row['is_active']}")
    actual = client.table("stocks").select("ticker,is_active").execute().data
    if plan_sync(actual):
        raise RuntimeError("S&P 100 membership verification failed")
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
