"""
fetch_prices_backup.py — yfinance fallback when Twelve Data fails.
Called by fetch_prices.py automatically.
WARNING: yfinance violates Yahoo Finance ToS. Remove before commercialization.
"""
import os
import sys
from datetime import datetime
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
supabase = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, to_yf


def main():
    print("yfinance fallback: fetching all S&P 100 prices...")
    yf_tickers = [to_yf(t) for t in SP100_TICKERS]
    tickers_str = " ".join(yf_tickers)
    data = yf.download(tickers_str, period="1d", interval="1m", group_by="ticker", progress=False)

    now = datetime.utcnow().isoformat()
    fetched, failed = 0, []

    for ticker in SP100_TICKERS:
        try:
            yf_sym = to_yf(ticker)
            if len(SP100_TICKERS) == 1:
                ticker_data = data
            else:
                ticker_data = data[yf_sym]

            latest = ticker_data["Close"].dropna().iloc[-1]
            price = float(latest)

            supabase.table("stock_prices").upsert({
                "ticker": ticker, "price": price, "fetched_at": now
            }).execute()
            supabase.table("stock_price_history").insert({
                "ticker": ticker, "price": price, "recorded_at": now
            }).execute()
            fetched += 1
        except Exception as e:
            print(f"  {ticker} failed: {e}")
            failed.append(ticker)

    supabase.table("fetch_logs").insert({
        "job_name":        "prices_backup",
        "status":          "success" if not failed else "partial",
        "records_fetched": fetched,
        "records_failed":  len(failed),
        "failed_tickers":  failed or None,
        "error_message":   "yfinance fallback used",
    }).execute()

    print(f"Backup done. Fetched: {fetched}, Failed: {len(failed)}")


if __name__ == "__main__":
    main()
