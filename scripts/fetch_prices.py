"""
fetch_prices.py — Fetch S&P 100 prices from Twelve Data (yfinance fallback).
Schedule: */15 14-21 * * 1-5 (GitHub Actions, market hours filtered internally)
"""
import os
import sys
import time
import requests
import pytz
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TWELVE_DATA_API_KEY = os.environ["TWELVE_DATA_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS

BATCH_SIZE = 8
TWELVE_DATA_DAILY_LIMIT = 800
BATCH_SLEEP = 1  # seconds between batches


def is_market_open() -> bool:
    et = pytz.timezone("America/New_York")
    now_et = datetime.now(et)
    if now_et.weekday() >= 5:
        return False
    market_open  = now_et.replace(hour=9,  minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0,  second=0, microsecond=0)
    return market_open <= now_et <= market_close


def fetch_batch(tickers: list[str]) -> dict:
    symbols = ",".join(tickers)
    # /quote returns price + change_pct + volume (same free tier allowance as /price)
    url = "https://api.twelvedata.com/quote"
    params = {"symbol": symbols, "apikey": TWELVE_DATA_API_KEY}
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    data = r.json()

    # Single ticker returns flat dict, multiple returns nested
    if len(tickers) == 1:
        return {tickers[0]: data} if "close" in data else {}
    return data


def upsert_prices(results: dict) -> tuple[int, list[str]]:
    fetched, failed = 0, []
    now = datetime.utcnow().isoformat()

    for ticker, data in results.items():
        if not isinstance(data, dict) or "close" not in data:
            failed.append(ticker)
            continue

        price = float(data["close"])

        # percent_change and volume are included in /quote response
        change_pct = float(data["percent_change"]) if data.get("percent_change") not in (None, "") else None
        volume     = int(data["volume"])            if data.get("volume")         not in (None, "") else None

        row_price = {
            "ticker":     ticker,
            "price":      price,
            "change_pct": change_pct,
            "volume":     volume,
            "fetched_at": now,
        }
        row_history = {
            "ticker":      ticker,
            "price":       price,
            "recorded_at": now,
        }
        supabase.table("stock_prices").upsert(row_price).execute()
        supabase.table("stock_price_history").insert(row_history).execute()
        fetched += 1

    return fetched, failed


def log_result(job: str, status: str, fetched: int, failed: list[str], error: str = ""):
    supabase.table("fetch_logs").insert({
        "job_name":        job,
        "status":          status,
        "records_fetched": fetched,
        "records_failed":  len(failed),
        "failed_tickers":  failed or None,
        "error_message":   error or None,
    }).execute()


def main():
    if not is_market_open():
        print("Market closed — skipping.")
        sys.exit(0)

    print(f"Fetching prices for {len(SP100_TICKERS)} tickers...")
    total_fetched, all_failed = 0, []

    batches = [SP100_TICKERS[i:i+BATCH_SIZE] for i in range(0, len(SP100_TICKERS), BATCH_SIZE)]

    twelve_data_failed = False
    for batch in batches:
        try:
            results = fetch_batch(batch)
            fetched, failed = upsert_prices(results)
            total_fetched += fetched
            all_failed.extend(failed)
            time.sleep(1)
        except Exception as e:
            print(f"  Twelve Data error: {e}")
            twelve_data_failed = True
            all_failed.extend(batch)

    if twelve_data_failed:
        print("Twelve Data failed — trying yfinance fallback...")
        import subprocess
        result = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "fetch_prices_backup.py")],
            capture_output=True, text=True
        )
        print(result.stdout)
        if result.returncode == 0:
            log_result("prices", "partial", total_fetched, all_failed, "yfinance fallback used")
            return

    status = "success" if not all_failed else "partial"
    log_result("prices", status, total_fetched, all_failed)
    print(f"Done. Fetched: {total_fetched}, Failed: {len(all_failed)}")


if __name__ == "__main__":
    main()
