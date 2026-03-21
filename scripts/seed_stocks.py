"""
seed_stocks.py — Run once to populate stocks + affiliate_links tables.
Usage: python scripts/seed_stocks.py
Data source: yfinance (free, no API key needed)
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
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, CRYPTO_TICKERS, COMPANY_NAMES


def fetch_yfinance_profile(ticker: str) -> dict | None:
    try:
        info = yf.Ticker(ticker).info
        if not info or info.get("trailingPegRatio") is None and not info.get("longName"):
            return None
        return {
            "name":     info.get("longName") or info.get("shortName") or ticker,
            "exchange": info.get("exchange"),
            "sector":   info.get("sector"),
            "logo_url": info.get("logo_url"),
        }
    except Exception as e:
        print(f"  yfinance error for {ticker}: {e}")
        return None


def seed_stocks():
    print(f"Seeding {len(SP100_TICKERS)} stocks via yfinance...")
    success, failed = 0, []

    for ticker in SP100_TICKERS:
        profile = fetch_yfinance_profile(ticker)
        if profile:
            row = {"ticker": ticker, **profile}
        else:
            row = {"ticker": ticker, "name": ticker}
            failed.append(ticker)

        supabase.table("stocks").upsert(row).execute()
        print(f"  {'OK' if profile else 'FALLBACK'} {ticker}: {row.get('name')}")
        time.sleep(0.5)

        success += 1

    print(f"\nDone. {success} upserted, {len(failed)} fallback: {failed}")


def seed_affiliate_links():
    print("\nSeeding affiliate_links (inactive placeholders)...")
    links = [
        {
            "partner":   "ibkr",
            "label":     "Trade on Interactive Brokers",
            "url":       "",
            "cpa_usd":   200,
            "placement": "stock_detail",
            "is_active": False,
        },
        {
            "partner":   "wise",
            "label":     "Transfer money with Wise",
            "url":       "",
            "cpa_usd":   35,
            "placement": "home",
            "is_active": False,
        },
    ]
    for link in links:
        existing = supabase.table("affiliate_links").select("id").eq("partner", link["partner"]).execute()
        if not existing.data:
            supabase.table("affiliate_links").insert(link).execute()
            print(f"  Inserted {link['partner']}")
        else:
            print(f"  Skip {link['partner']} (already exists)")


def seed_crypto():
    """Seed crypto assets into the stocks table."""
    print(f"\nSeeding {len(CRYPTO_TICKERS)} crypto tickers...")
    for ticker in CRYPTO_TICKERS:
        name = COMPANY_NAMES.get(ticker, ticker.replace("-USD", ""))
        row = {
            "ticker": ticker,
            "name": name,
            "exchange": "CRYPTO",
            "sector": "Cryptocurrency",
            "logo_url": None,
        }
        supabase.table("stocks").upsert(row).execute()
        print(f"  OK {ticker}: {name}")
    print(f"Done. {len(CRYPTO_TICKERS)} crypto tickers seeded.")


if __name__ == "__main__":
    seed_stocks()
    seed_crypto()
    seed_affiliate_links()
