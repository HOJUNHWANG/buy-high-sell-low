"""
update_market_caps.py — Populate market_cap for all stocks + crypto via yfinance.
Usage: python scripts/update_market_caps.py
Run periodically (weekly) or once to seed initial data.
"""
import os
import sys
import time
import requests
import urllib3
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ALL_TICKERS, to_yf

# Manual fallbacks for tickers where yfinance returns no marketCap (approximate, update periodically)
MANUAL_MARKET_CAPS = {
    "AMT":         86_000_000_000,
    "GEV":        150_000_000_000,
    "LRCX":       185_000_000_000,
    "MMM":         80_000_000_000,
    "MU":         145_000_000_000,
    "PLTR":       310_000_000_000,
    "UBER":       190_000_000_000,
    "USDT-USD":   145_000_000_000,   # Tether ~$145B
    "APT-USD":     11_000_000_000,   # Aptos ~$11B
    "ARB-USD":      8_000_000_000,   # Arbitrum ~$8B
    "MMC":        100_000_000_000,   # Marsh & McLennan ~$100B
}

HTTP_TIMEOUT_SECONDS = 30


def rest_headers(extra: dict | None = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def update_market_cap(ticker: str, market_cap: int):
    try:
        supabase.table("stocks").update({"market_cap": market_cap}).eq("ticker", ticker).execute()
    except Exception:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        res = requests.patch(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/stocks?ticker=eq.{ticker}",
            json={"market_cap": market_cap},
            headers=rest_headers(),
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=False,
        )
        res.raise_for_status()


def log_result(job: str, status: str, fetched: int, failed: int, error: str = ""):
    try:
        supabase.table("fetch_logs").insert({
            "job_name":        job,
            "status":          status,
            "records_fetched": fetched,
            "records_failed":  failed,
            "error_message":   error or None,
        }).execute()
    except Exception as e:
        print(f"Failed to log result to Supabase: {e}")


def main():
    tickers = [t.upper() for t in sys.argv[1:]] if len(sys.argv) > 1 else ALL_TICKERS
    print(f"Updating market caps for {len(tickers)} tickers...")
    updated, failed = 0, 0

    for ticker in tickers:
        try:
            # Try yfinance first (with central mapping)
            yf_ticker = to_yf(ticker)
            info = yf.Ticker(yf_ticker).info
            market_cap = info.get("marketCap")

            # Fall back to manual values
            if not market_cap:
                market_cap = MANUAL_MARKET_CAPS.get(ticker)

            if market_cap:
                update_market_cap(ticker, market_cap)
                label = f"${market_cap / 1e9:.1f}B" if market_cap >= 1e9 else f"${market_cap / 1e6:.0f}M"
                print(f"  {ticker}: {label}")
                updated += 1
            else:
                print(f"  {ticker}: no market cap data")
                failed += 1
        except Exception as e:
            market_cap = MANUAL_MARKET_CAPS.get(ticker)
            if market_cap:
                update_market_cap(ticker, market_cap)
                label = f"${market_cap / 1e9:.1f}B" if market_cap >= 1e9 else f"${market_cap / 1e6:.0f}M"
                print(f"  {ticker}: {label} (manual fallback after yfinance error)")
                updated += 1
            else:
                print(f"  {ticker}: error — {e}")
                failed += 1
        time.sleep(0.3)

    print(f"\nDone. Updated: {updated}, Failed: {failed}")
    
    # Log to Supabase
    status = "success" if failed == 0 else "partial"
    log_result("market_caps", status, updated, failed)


if __name__ == "__main__":
    main()
