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

load_dotenv()

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS


def main():
    print("yfinance fallback: fetching all S&P 100 prices...")
    tickers_str = " ".join(SP100_TICKERS)
    data = yf.download(tickers_str, period="1d", interval="1m", group_by="ticker", progress=False)

    now = datetime.utcnow().isoformat()
    fetched, failed = 0, []

    for ticker in SP100_TICKERS:
        try:
            if len(SP100_TICKERS) == 1:
                ticker_data = data
            else:
                ticker_data = data[ticker]

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
