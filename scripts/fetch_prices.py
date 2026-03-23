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

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL        = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TWELVE_DATA_API_KEY = os.environ["TWELVE_DATA_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, CRYPTO_TICKERS, to_yf

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
    # /quote returns price + change_pct + volume (same free tier allowance as /price)
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


def upsert_prices(results: dict, force_history: bool = False) -> tuple[int, list[str]]:
    fetched, failed = 0, []
    now = datetime.utcnow().isoformat()
    # Cutoff: skip history insert if last entry for this ticker is within 10 min
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(minutes=10)).isoformat()

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
        today = datetime.utcnow().strftime("%Y-%m-%d")
        row_long = {
            "ticker": ticker,
            "date":   today,
            "close":  price,
        }
        # Add open/high/low from quote if available
        for field in ("open", "high", "low"):
            val = data.get(field)
            if val not in (None, ""):
                row_long[field] = float(val)
        if volume is not None:
            row_long["volume"] = volume

        # Always update current price
        supabase.table("stock_prices").upsert(row_price).execute()

        # Only insert history if no recent entry (prevents duplicate rows at same timestamp)
        should_insert_history = force_history
        if not should_insert_history:
            recent = supabase.table("stock_price_history") \
                .select("id") \
                .eq("ticker", ticker) \
                .gte("recorded_at", cutoff) \
                .limit(1) \
                .execute()
            should_insert_history = len(recent.data) == 0

        if should_insert_history:
            supabase.table("stock_price_history").insert({
                "ticker": ticker, "price": price, "recorded_at": now,
            }).execute()

        supabase.table("price_history_long").upsert(row_long, on_conflict="ticker,date").execute()
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


def fetch_crypto_yfinance():
    """Fetch crypto prices via yfinance (24/7, no market hours check)."""
    if not CRYPTO_TICKERS:
        return
    print(f"\nFetching crypto prices for {len(CRYPTO_TICKERS)} tickers via yfinance...")
    import yfinance as yf
    from datetime import timedelta
    yf_tickers = [to_yf(t) for t in CRYPTO_TICKERS]
    tickers_str = " ".join(yf_tickers)
    data = yf.download(tickers_str, period="2d", interval="1h", group_by="ticker", progress=False)

    now = datetime.utcnow().isoformat()
    cutoff = (datetime.utcnow() - timedelta(minutes=50)).isoformat()  # crypto is hourly
    fetched, failed = 0, []

    for ticker in CRYPTO_TICKERS:
        try:
            yf_sym = to_yf(ticker)
            if len(CRYPTO_TICKERS) == 1:
                ticker_data = data
            else:
                ticker_data = data[yf_sym]
            closes = ticker_data["Close"].dropna()
            volumes = ticker_data["Volume"].dropna()
            if closes.empty:
                failed.append(ticker)
                continue
            price = float(closes.iloc[-1])

            # Calculate 24h change %
            change_pct = None
            if len(closes) >= 2:
                idx_24h = max(0, len(closes) - 24)
                prev_price = float(closes.iloc[idx_24h])
                if prev_price > 0:
                    change_pct = round(((price - prev_price) / prev_price) * 100, 4)

            volume = int(volumes.iloc[-24:].sum()) if not volumes.empty else None

            supabase.table("stock_prices").upsert({
                "ticker": ticker, "price": price, "change_pct": change_pct,
                "volume": volume, "fetched_at": now,
            }).execute()

            # Only insert history if no recent entry (prevent duplicates)
            recent = supabase.table("stock_price_history") \
                .select("id").eq("ticker", ticker) \
                .gte("recorded_at", cutoff).limit(1).execute()
            if len(recent.data) == 0:
                supabase.table("stock_price_history").insert({
                    "ticker": ticker, "price": price, "recorded_at": now
                }).execute()

            today = datetime.utcnow().strftime("%Y-%m-%d")
            supabase.table("price_history_long").upsert({
                "ticker": ticker, "date": today, "close": price,
                "volume": volume,
            }, on_conflict="ticker,date").execute()
            fetched += 1
        except Exception as e:
            print(f"  {ticker} failed: {e}")
            failed.append(ticker)

    log_result("crypto_prices", "success" if not failed else "partial", fetched, failed)
    print(f"Crypto done. Fetched: {fetched}, Failed: {len(failed)}")


def main():
    # Always fetch crypto (24/7 market)
    try:
        fetch_crypto_yfinance()
    except Exception as e:
        print(f"Crypto fetch error: {e}")

    # Stocks: during market hours OR post-market-close final fetch
    post_market = is_post_market_close_window()
    if not is_market_open() and not post_market:
        print("Stock market closed — skipping stocks.")
        return

    if post_market:
        print("Post-market close window — fetching final closing prices...")

    print(f"Fetching prices for {len(SP100_TICKERS)} tickers...")
    total_fetched, all_failed = 0, []

    batches = [SP100_TICKERS[i:i+BATCH_SIZE] for i in range(0, len(SP100_TICKERS), BATCH_SIZE)]

    twelve_data_failed = False
    twelve_data_error = ""
    for batch in batches:
        try:
            results = fetch_batch(batch)
            fetched, failed = upsert_prices(results, force_history=post_market)
            total_fetched += fetched
            all_failed.extend(failed)
            time.sleep(1)
        except Exception as e:
            print(f"  Twelve Data error: {e}")
            twelve_data_failed = True
            twelve_data_error = str(e)
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
            log_result("prices", "partial", total_fetched, all_failed, f"yfinance fallback used. Twelve Data: {twelve_data_error}")
            return

    status = "success" if not all_failed else "partial"
    log_result("prices", status, total_fetched, all_failed)
    print(f"Done. Fetched: {total_fetched}, Failed: {len(all_failed)}")


if __name__ == "__main__":
    main()
