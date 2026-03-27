"""
fetch_prices.py — Fetch S&P 100 + crypto prices from Twelve Data.
Schedule: */15 14-21 * * 1-5 (GitHub Actions, market hours filtered internally)
"""
import os
import sys
import time
import requests
import pytz
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL        = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TWELVE_DATA_API_KEY = os.environ["TWELVE_DATA_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP500_TICKERS, CRYPTO_TICKERS, ETF_TICKERS, to_twelve_data_crypto

BATCH_SIZE = 8
BATCH_SLEEP = 8  # seconds between batches (free plan: 8 credits/min)


def is_market_open() -> bool:
    et = pytz.timezone("America/New_York")
    now_et = datetime.now(et)
    if now_et.weekday() >= 5:
        return False
    market_open  = now_et.replace(hour=9,  minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0,  second=0, microsecond=0)
    return market_open <= now_et <= market_close


def is_post_market_close_window() -> bool:
    """True if within 30 minutes after market close (4:00-4:30 PM ET).
    Used to do one final fetch for closing prices."""
    et = pytz.timezone("America/New_York")
    now_et = datetime.now(et)
    if now_et.weekday() >= 5:
        return False
    close_time = now_et.replace(hour=16, minute=0,  second=0, microsecond=0)
    final_time = now_et.replace(hour=16, minute=30, second=0, microsecond=0)
    return close_time < now_et <= final_time


def fetch_batch(tickers: list[str]) -> dict:
    symbols = ",".join(tickers)
    url = "https://api.twelvedata.com/quote"
    params = {"symbol": symbols, "apikey": TWELVE_DATA_API_KEY}
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    data = r.json()

    # Top-level error response (e.g. rate limit, invalid key)
    if isinstance(data, dict) and data.get("status") == "error":
        raise Exception(f"Twelve Data API error {data.get('code', '?')}: {data.get('message', 'unknown')}")

    # Single ticker returns flat dict, multiple returns nested
    if len(tickers) == 1:
        return {tickers[0]: data} if "close" in data else {}
    return data


def upsert_prices(results: dict, force_history: bool = False, ticker_map: dict | None = None) -> tuple[int, list[str]]:
    """Upsert price data. ticker_map converts API symbols back to DB tickers (for crypto)."""
    fetched, failed = 0, []
    now = datetime.utcnow().isoformat()
    cutoff = (datetime.utcnow() - timedelta(minutes=10)).isoformat()

    for api_ticker, data in results.items():
        if not isinstance(data, dict) or "close" not in data:
            failed.append(api_ticker)
            continue

        # Convert API ticker back to DB ticker if mapping exists
        db_ticker = ticker_map.get(api_ticker, api_ticker) if ticker_map else api_ticker

        price = float(data["close"])
        change_pct = float(data["percent_change"]) if data.get("percent_change") not in (None, "") else None
        volume     = int(data["volume"])            if data.get("volume")         not in (None, "") else None

        row_price = {
            "ticker":     db_ticker,
            "price":      price,
            "change_pct": change_pct,
            "volume":     volume,
            "fetched_at": now,
        }
        today = datetime.utcnow().strftime("%Y-%m-%d")
        row_long = {
            "ticker": db_ticker,
            "date":   today,
            "close":  price,
        }
        for field in ("open", "high", "low"):
            val = data.get(field)
            if val not in (None, ""):
                row_long[field] = float(val)
        if volume is not None:
            row_long["volume"] = volume

        # Always update current price
        supabase.table("stock_prices").upsert(row_price).execute()

        # Only insert history if no recent entry (prevents duplicate rows)
        should_insert_history = force_history
        if not should_insert_history:
            recent = supabase.table("stock_price_history") \
                .select("id") \
                .eq("ticker", db_ticker) \
                .gte("recorded_at", cutoff) \
                .limit(1) \
                .execute()
            should_insert_history = len(recent.data) == 0

        if should_insert_history:
            try:
                supabase.table("stock_price_history").insert({
                    "ticker": db_ticker, "price": price, "recorded_at": now,
                }).execute()
            except Exception as e:
                print(f"  Warning: failed to record to stock_price_history for {db_ticker}: {e}")

        try:
            supabase.table("price_history_long").upsert(row_long, on_conflict="ticker,date").execute()
        except Exception as e:
            # Most likely 'id' column default issue or constraint
            print(f"  Warning: failed to record to price_history_long for {db_ticker}: {e}")
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


def fetch_crypto_twelve_data():
    """Fetch crypto prices via Twelve Data (24/7, no market hours check)."""
    if not CRYPTO_TICKERS:
        return
    print(f"\nFetching crypto prices for {len(CRYPTO_TICKERS)} tickers via Twelve Data...")

    # Build API symbols and mapping back to DB tickers
    # Twelve Data uses BTC/USD format, our DB uses BTC-USD
    api_symbols = [to_twelve_data_crypto(t) for t in CRYPTO_TICKERS]
    ticker_map = {to_twelve_data_crypto(t): t for t in CRYPTO_TICKERS}

    # 50-min dedup guard for hourly crypto fetches
    cutoff = (datetime.utcnow() - timedelta(minutes=50)).isoformat()

    total_fetched, all_failed = 0, []
    batches = [api_symbols[i:i+BATCH_SIZE] for i in range(0, len(api_symbols), BATCH_SIZE)]

    for batch in batches:
        try:
            results = fetch_batch(batch)
            fetched, failed = upsert_prices(results, ticker_map=ticker_map)
            total_fetched += fetched
            all_failed.extend(failed)
            time.sleep(BATCH_SLEEP)
        except Exception as e:
            import traceback; traceback.print_exc()
            all_failed.extend(batch)

    log_result("crypto_prices", "success" if not all_failed else "partial", total_fetched, all_failed)
    print(f"Crypto done. Fetched: {total_fetched}, Failed: {len(all_failed)}")


def main():
    # Always fetch crypto (24/7 market)
    try:
        fetch_crypto_twelve_data()
    except Exception as e:
        print(f"Crypto fetch error: {e}")

    # Stocks: during market hours OR post-market-close final fetch
    post_market = is_post_market_close_window()
    if not is_market_open() and not post_market:
        print("Stock market closed — skipping stocks.")
        return

    if post_market:
        print("Post-market close window — fetching final closing prices...")

    stock_tickers = SP500_TICKERS + ETF_TICKERS
    print(f"Fetching prices for {len(stock_tickers)} stock tickers...")
    total_fetched, all_failed = 0, []

    batches = [stock_tickers[i:i+BATCH_SIZE] for i in range(0, len(stock_tickers), BATCH_SIZE)]

    for batch in batches:
        try:
            results = fetch_batch(batch)
            fetched, failed = upsert_prices(results, force_history=post_market)
            total_fetched += fetched
            all_failed.extend(failed)
            time.sleep(BATCH_SLEEP)
        except Exception as e:
            print(f"  Twelve Data error: {e}")
            all_failed.extend(batch)

    status = "success" if not all_failed else "partial"
    log_result("prices", status, total_fetched, all_failed)
    print(f"Done. Fetched: {total_fetched}, Failed: {len(all_failed)}")


if __name__ == "__main__":
    main()
