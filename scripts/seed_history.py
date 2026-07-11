"""
seed_history.py — Seed 1 year of daily OHLCV prices via yfinance (FREE).
Inserts into price_history_long for chart fallback data.
Safe to re-run (skips existing dates).

Usage:
  python scripts/seed_history.py            # all tickers
  python scripts/seed_history.py AAPL MSFT  # specific tickers
"""
import os
import sys
import time
from datetime import datetime, timedelta
import csv
from io import StringIO
import requests
from requests.exceptions import SSLError
import urllib3
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
supabase = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ALL_EQUITY_TICKERS, CRYPTO_TICKERS, HISTORY_SEED_TICKERS, to_yf

BATCH_SIZE = int(os.environ.get("YF_BATCH_SIZE", "10"))
SLEEP_BETWEEN_BATCHES = float(os.environ.get("YF_SLEEP_SECONDS", "5"))
MAX_DOWNLOAD_ATTEMPTS = 3
HTTP_TIMEOUT_SECONDS = 30
VERIFY_HTTP_SSL = os.environ.get("BHSL_VERIFY_HTTP_SSL", "1").lower() not in {"0", "false", "no"}
HISTORY_SOURCE = os.environ.get("BHSL_HISTORY_SOURCE", "auto").lower()


def clean_float(value) -> float | None:
    if value is None or value != value:
        return None
    return round(float(value), 4)


def get_existing_dates(ticker: str) -> set[str]:
    """Fetch dates already in DB to avoid duplicates."""
    cutoff = (datetime.utcnow() - timedelta(days=366)).date().isoformat()
    resp = supabase.table("price_history_long") \
        .select("date") \
        .eq("ticker", ticker) \
        .gte("date", cutoff) \
        .execute()
    return {row["date"][:10] for row in (resp.data or [])}


def to_stooq(ticker: str) -> str:
    """Convert DB ticker to Stooq's US daily CSV symbol."""
    return ticker.replace(".", "-").lower() + ".us"


def request_with_ssl_fallback(url: str, *, params: dict | None = None, headers: dict | None = None):
    try:
        res = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=VERIFY_HTTP_SSL,
        )
        res.raise_for_status()
        return res
    except SSLError as e:
        if not VERIFY_HTTP_SSL:
            raise e
        print("  SSL verify failed; retrying without certificate verification...")
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        res = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=False,
        )
        res.raise_for_status()
        return res


def fetch_yahoo_chart_daily(ticker: str) -> list[dict]:
    end = int(time.time())
    start = end - 366 * 24 * 60 * 60
    symbol = to_yf(ticker)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {
        "period1": start,
        "period2": end,
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    }
    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        res = request_with_ssl_fallback(url, params=params, headers=headers)
        payload = res.json()
    except Exception as e:
        print(f"  FAIL {ticker}: Yahoo chart request failed: {e}")
        return []

    result = (payload.get("chart", {}).get("result") or [None])[0]
    if not result:
        print(f"  SKIP {ticker}: no Yahoo chart data")
        return []

    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    rows = []
    for idx, ts in enumerate(timestamps):
        close = clean_float((quote.get("close") or [None])[idx])
        if close is None:
            continue
        volume = (quote.get("volume") or [None])[idx]
        rows.append({
            "ticker": ticker,
            "date": datetime.utcfromtimestamp(ts).date().isoformat(),
            "open": clean_float((quote.get("open") or [None])[idx]),
            "high": clean_float((quote.get("high") or [None])[idx]),
            "low": clean_float((quote.get("low") or [None])[idx]),
            "close": close,
            "volume": int(volume) if volume is not None else None,
        })
    return rows


def fetch_stooq_daily(ticker: str) -> list[dict]:
    end = datetime.utcnow().date()
    start = end - timedelta(days=366)
    url = "https://stooq.com/q/d/l/"
    params = {
        "s": to_stooq(ticker),
        "d1": start.strftime("%Y%m%d"),
        "d2": end.strftime("%Y%m%d"),
        "i": "d",
    }
    try:
        res = request_with_ssl_fallback(url, params=params)
    except Exception as e:
        print(f"  FAIL {ticker}: Stooq request failed: {e}")
        return []

    text = res.text.strip()
    if not text or text.lower() == "no data" or "Date,Open,High,Low,Close,Volume" not in text:
        print(f"  SKIP {ticker}: no Stooq data")
        return []

    rows = []
    for row in csv.DictReader(StringIO(text)):
        close = clean_float(row.get("Close"))
        if close is None:
            continue
        volume = row.get("Volume")
        rows.append({
            "ticker": ticker,
            "date": row["Date"],
            "open": clean_float(row.get("Open")),
            "high": clean_float(row.get("High")),
            "low": clean_float(row.get("Low")),
            "close": close,
            "volume": int(float(volume)) if volume not in (None, "", "0") else None,
        })
    return rows


def upsert_daily_rows(ticker: str, rows: list[dict]) -> tuple[int, int]:
    existing = get_existing_dates(ticker)
    missing = [row for row in rows if row["date"] not in existing]

    if not missing:
        print(f"  OK {ticker}: all {len(rows)} days already exist")
        return 0, len(rows)

    CHUNK = 500
    for i in range(0, len(missing), CHUNK):
        supabase.table("price_history_long").upsert(
            missing[i:i+CHUNK],
            on_conflict="ticker,date",
        ).execute()

    print(f"  OK {ticker}: {len(missing)} days inserted, {len(existing)} already existed")
    return len(missing), len(existing)


def seed_ticker_from_fallback(ticker: str) -> tuple[int, int]:
    rows = fetch_yahoo_chart_daily(ticker)
    if not rows:
        rows = fetch_stooq_daily(ticker)
    if not rows:
        return 0, 0
    return upsert_daily_rows(ticker, rows)


def seed_ticker_history(tickers: list[str]):
    """Download 1 year of daily data and insert missing rows."""
    print(f"Downloading 1Y daily data for {len(tickers)} tickers...")

    if HISTORY_SOURCE in {"yahoo", "chart", "direct"}:
        print("Using direct Yahoo chart endpoint per ticker...")
        total_inserted = 0
        total_skipped = 0
        for ticker in tickers:
            inserted, skipped = seed_ticker_from_fallback(ticker)
            total_inserted += inserted
            total_skipped += skipped
            time.sleep(0.5)
        print(f"\nDone. Inserted: {total_inserted}, Skipped (existing): {total_skipped}")
        return

    yf_tickers = [to_yf(t) for t in tickers]
    tickers_str = " ".join(yf_tickers)
    data = None
    for attempt in range(1, MAX_DOWNLOAD_ATTEMPTS + 1):
        try:
            data = yf.download(
                tickers_str,
                period="1y",
                interval="1d",
                group_by="ticker",
                progress=False,
                auto_adjust=True,
                threads=True,
            )
            if not data.empty:
                break
        except Exception as e:
            print(f"  yfinance download attempt {attempt}/{MAX_DOWNLOAD_ATTEMPTS} failed: {e}")

        if attempt < MAX_DOWNLOAD_ATTEMPTS:
            wait = SLEEP_BETWEEN_BATCHES * attempt
            print(f"  Waiting {wait:.0f}s before retry...")
            time.sleep(wait)

    if data is None or data.empty:
        print("  yfinance returned no batch data; falling back to direct Yahoo chart per ticker...")
        total_inserted = 0
        total_skipped = 0
        for ticker in tickers:
            inserted, skipped = seed_ticker_from_fallback(ticker)
            total_inserted += inserted
            total_skipped += skipped
            time.sleep(0.5)
        print(f"\nDone. Inserted: {total_inserted}, Skipped (existing): {total_skipped}")
        return

    total_inserted = 0
    total_skipped = 0

    for ticker in tickers:
        try:
            yf_sym = to_yf(ticker)
            if len(tickers) == 1:
                ticker_data = data
            else:
                ticker_data = data[yf_sym]

            daily = ticker_data.dropna(subset=["Close"])
            if daily.empty:
                print(f"  yfinance empty for {ticker}; trying direct Yahoo chart fallback...")
                inserted, skipped = seed_ticker_from_fallback(ticker)
                total_inserted += inserted
                total_skipped += skipped
                continue

            rows = []
            for ts, values in daily.iterrows():
                date_str = ts.strftime("%Y-%m-%d")
                volume = values.get("Volume")
                rows.append({
                    "ticker": ticker,
                    "date": date_str,
                    "open": clean_float(values.get("Open")),
                    "high": clean_float(values.get("High")),
                    "low": clean_float(values.get("Low")),
                    "close": clean_float(values.get("Close")),
                    "volume": int(volume) if volume == volume else None,
                })

            inserted, skipped = upsert_daily_rows(ticker, rows)
            total_inserted += inserted
            total_skipped += skipped

        except Exception as e:
            print(f"  yfinance failed for {ticker}: {e}; trying direct Yahoo chart fallback...")
            inserted, skipped = seed_ticker_from_fallback(ticker)
            total_inserted += inserted
            total_skipped += skipped

    print(f"\nDone. Inserted: {total_inserted}, Skipped (existing): {total_skipped}")


def main():
    # Allow specific tickers or --crypto / --stocks / --all via CLI args
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--crypto":
            tickers = CRYPTO_TICKERS
            print(f"Seeding {len(tickers)} crypto tickers")
        elif arg == "--stocks":
            tickers = ALL_EQUITY_TICKERS
            print(f"Seeding {len(tickers)} tracked equity tickers")
        elif arg == "--all":
            tickers = HISTORY_SEED_TICKERS
            print(f"Seeding all {len(tickers)} tickers (stocks + crypto)")
        else:
            tickers = [t.upper() for t in sys.argv[1:]]
            print(f"Seeding specific tickers: {tickers}")
    else:
        tickers = HISTORY_SEED_TICKERS
        print(f"Seeding all {len(tickers)} tickers (stocks + crypto)")

    # Process in batches for yfinance download
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i+BATCH_SIZE]
        print(f"\n--- Batch {i//BATCH_SIZE + 1}: {batch[0]}...{batch[-1]} ---")
        seed_ticker_history(batch)
        if i + BATCH_SIZE < len(tickers):
            print(f"Waiting {SLEEP_BETWEEN_BATCHES:.0f}s before next batch...")
            time.sleep(SLEEP_BETWEEN_BATCHES)


if __name__ == "__main__":
    main()
