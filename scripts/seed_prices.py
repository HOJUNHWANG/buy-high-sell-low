"""
seed_prices.py — One-time price seed using yfinance (for testing).
Populates stock_prices + stock_price_history regardless of market hours.
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
    print(f"Fetching latest prices for {len(SP100_TICKERS)} tickers via yfinance...")
    tickers_str = " ".join(SP100_TICKERS)
    data = yf.download(tickers_str, period="5d", interval="1d", group_by="ticker", progress=False, auto_adjust=True)

    now = datetime.utcnow().isoformat()
    fetched, failed = 0, []

    for ticker in SP100_TICKERS:
        try:
            if len(SP100_TICKERS) == 1:
                ticker_data = data
            else:
                ticker_data = data[ticker]

            closes = ticker_data["Close"].dropna()
            if len(closes) < 2:
                failed.append(ticker)
                continue

            price     = float(closes.iloc[-1])
            prev      = float(closes.iloc[-2])
            change_pct = round((price - prev) / prev * 100, 4)

            supabase.table("stock_prices").upsert({
                "ticker":     ticker,
                "price":      price,
                "change_pct": change_pct,
                "fetched_at": now,
            }).execute()

            # Insert last 5 days of history
            for ts, row in ticker_data["Close"].dropna().items():
                supabase.table("stock_price_history").insert({
                    "ticker":      ticker,
                    "price":       float(row),
                    "recorded_at": ts.isoformat(),
                }).execute()

            print(f"  OK {ticker}: ${price:.2f} ({'+' if change_pct>=0 else ''}{change_pct:.2f}%)")
            fetched += 1
        except Exception as e:
            print(f"  FAIL {ticker}: {e}")
            failed.append(ticker)

    print(f"\nDone. {fetched} inserted, {len(failed)} failed: {failed}")

if __name__ == "__main__":
    main()
