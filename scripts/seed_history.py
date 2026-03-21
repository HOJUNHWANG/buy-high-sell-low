"""
seed_history.py — Seed 1 year of daily close prices via yfinance (FREE).
Inserts into stock_price_history. Safe to re-run (skips existing dates).

Usage:
  python scripts/seed_history.py            # all tickers
  python scripts/seed_history.py AAPL MSFT  # specific tickers
"""
import os
import sys
from datetime import datetime, timedelta
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
supabase = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, CRYPTO_TICKERS, ALL_TICKERS, to_yf

BATCH_SIZE = 20  # yfinance handles multi-ticker downloads well


def get_existing_dates(ticker: str) -> set[str]:
    """Fetch dates already in DB to avoid duplicates."""
    cutoff = (datetime.utcnow() - timedelta(days=400)).isoformat()
    resp = supabase.table("stock_price_history") \
        .select("recorded_at") \
        .eq("ticker", ticker) \
        .gte("recorded_at", cutoff) \
        .execute()
    return {row["recorded_at"][:10] for row in (resp.data or [])}


def seed_ticker_history(tickers: list[str]):
    """Download 1 year of daily data and insert missing rows."""
    print(f"Downloading 1Y daily data for {len(tickers)} tickers...")
    yf_tickers = [to_yf(t) for t in tickers]
    tickers_str = " ".join(yf_tickers)
    data = yf.download(
        tickers_str,
        period="1y",
        interval="1d",
        group_by="ticker",
        progress=True,
        auto_adjust=True,
        threads=True,
    )

    total_inserted = 0
    total_skipped = 0

    for ticker in tickers:
        try:
            yf_sym = to_yf(ticker)
            if len(tickers) == 1:
                ticker_data = data
            else:
                ticker_data = data[yf_sym]

            closes = ticker_data["Close"].dropna()
            if closes.empty:
                print(f"  SKIP {ticker}: no data")
                continue

            existing = get_existing_dates(ticker)
            rows = []
            for ts, price in closes.items():
                date_str = ts.strftime("%Y-%m-%d")
                if date_str in existing:
                    total_skipped += 1
                    continue
                rows.append({
                    "ticker": ticker,
                    "price": round(float(price), 4),
                    "recorded_at": ts.isoformat(),
                })

            if not rows:
                print(f"  OK {ticker}: all {len(closes)} days already exist")
                continue

            # Batch insert (Supabase supports bulk upsert)
            CHUNK = 500
            for i in range(0, len(rows), CHUNK):
                supabase.table("stock_price_history").insert(rows[i:i+CHUNK]).execute()

            total_inserted += len(rows)
            print(f"  OK {ticker}: {len(rows)} days inserted, {len(existing)} already existed")

        except Exception as e:
            print(f"  FAIL {ticker}: {e}")

    print(f"\nDone. Inserted: {total_inserted}, Skipped (existing): {total_skipped}")


def main():
    # Allow specific tickers or --crypto / --stocks / --all via CLI args
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--crypto":
            tickers = CRYPTO_TICKERS
            print(f"Seeding {len(tickers)} crypto tickers")
        elif arg == "--stocks":
            tickers = SP100_TICKERS
            print(f"Seeding {len(tickers)} S&P 100 tickers")
        elif arg == "--all":
            tickers = ALL_TICKERS
            print(f"Seeding all {len(tickers)} tickers (stocks + crypto)")
        else:
            tickers = [t.upper() for t in sys.argv[1:]]
            print(f"Seeding specific tickers: {tickers}")
    else:
        tickers = ALL_TICKERS
        print(f"Seeding all {len(tickers)} tickers (stocks + crypto)")

    # Process in batches for yfinance download
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i+BATCH_SIZE]
        print(f"\n--- Batch {i//BATCH_SIZE + 1}: {batch[0]}...{batch[-1]} ---")
        seed_ticker_history(batch)


if __name__ == "__main__":
    main()
