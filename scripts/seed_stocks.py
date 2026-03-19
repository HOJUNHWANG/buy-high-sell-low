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

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS


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


if __name__ == "__main__":
    seed_stocks()
    seed_affiliate_links()
