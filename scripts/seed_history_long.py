"""
seed_history_long.py — Seed 20+ years of daily OHLCV data via yfinance.
Inserts into price_history_long. Safe to re-run (skips existing dates via UNIQUE constraint).

Usage:
  python scripts/seed_history_long.py            # all tickers
  python scripts/seed_history_long.py --stocks    # S&P 500 only
  python scripts/seed_history_long.py --crypto    # crypto only
  python scripts/seed_history_long.py AAPL MSFT   # specific tickers
"""
import os
import sys
import time
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
supabase = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP500_TICKERS, CRYPTO_TICKERS, ALL_TICKERS, to_yf

BATCH_SIZE = 10  # smaller batches for 20Y data (larger payloads)
CHUNK_INSERT = 500


def seed_ticker_history(tickers: list[str]):
    """Download max available daily OHLCV data and insert into price_history_long."""
    print(f"Downloading max daily data for {len(tickers)} tickers...")
    yf_tickers = [to_yf(t) for t in tickers]
    tickers_str = " ".join(yf_tickers)

    try:
        data = yf.download(
            tickers_str,
            period="max",
            interval="1d",
            group_by="ticker",
            progress=True,
            auto_adjust=True,
            threads=True,
        )
    except Exception as e:
        print(f"  DOWNLOAD FAILED: {e}")
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

            closes = ticker_data["Close"].dropna()
            if closes.empty:
                print(f"  SKIP {ticker}: no data")
                continue

            # Build rows with OHLCV
            rows = []
            for ts in closes.index:
                date_str = ts.strftime("%Y-%m-%d")
                row = {
                    "ticker": ticker,
                    "date": date_str,
                    "close": round(float(ticker_data["Close"].loc[ts]), 4),
                }
                # Add OHLV if available
                for col, key in [("Open", "open"), ("High", "high"), ("Low", "low")]:
                    try:
                        val = float(ticker_data[col].loc[ts])
                        if val == val:  # not NaN
                            row[key] = round(val, 4)
                    except (KeyError, TypeError):
                        pass
                try:
                    vol = ticker_data["Volume"].loc[ts]
                    if vol == vol:  # not NaN
                        row["volume"] = int(vol)
                except (KeyError, TypeError):
                    pass
                rows.append(row)

            if not rows:
                print(f"  OK {ticker}: no rows to insert")
                continue

            # Batch insert with ON CONFLICT DO NOTHING (via unique constraint)
            inserted = 0
            for i in range(0, len(rows), CHUNK_INSERT):
                chunk = rows[i:i + CHUNK_INSERT]
                try:
                    supabase.table("price_history_long").upsert(
                        chunk, on_conflict="ticker,date"
                    ).execute()
                    inserted += len(chunk)
                except Exception as e:
                    # If upsert fails, try insert with ignore
                    print(f"    chunk {i}-{i+len(chunk)} error: {e}")
                    total_skipped += len(chunk)

            total_inserted += inserted
            print(f"  OK {ticker}: {inserted} days upserted (total rows: {len(rows)})")

        except Exception as e:
            print(f"  FAIL {ticker}: {e}")

    print(f"\nBatch done. Upserted: {total_inserted}, Errors: {total_skipped}")


def main():
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--crypto":
            tickers = CRYPTO_TICKERS
            print(f"Seeding {len(tickers)} crypto tickers (max history)")
        elif arg == "--stocks":
            tickers = SP500_TICKERS
            print(f"Seeding {len(tickers)} S&P 100 tickers (max history)")
        elif arg == "--all":
            tickers = ALL_TICKERS
            print(f"Seeding all {len(tickers)} tickers (max history)")
        else:
            tickers = [t.upper() for t in sys.argv[1:]]
            print(f"Seeding specific tickers: {tickers}")
    else:
        tickers = ALL_TICKERS
        print(f"Seeding all {len(tickers)} tickers (max history)")

    start = time.time()
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i + BATCH_SIZE]
        print(f"\n{'='*60}")
        print(f"Batch {i // BATCH_SIZE + 1}/{(len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE}: {batch[0]}...{batch[-1]}")
        print(f"{'='*60}")
        seed_ticker_history(batch)
        # Small delay between batches to avoid rate limiting
        if i + BATCH_SIZE < len(tickers):
            time.sleep(2)

    elapsed = time.time() - start
    print(f"\nAll done in {elapsed:.0f}s ({elapsed/60:.1f}m)")


if __name__ == "__main__":
    main()
