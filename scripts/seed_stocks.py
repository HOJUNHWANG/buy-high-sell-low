"""
seed_stocks.py — Run once to populate stocks + affiliate_links tables.
Usage: python scripts/seed_stocks.py
Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FMP_API_KEY in env
"""
import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
FMP_API_KEY  = os.environ["FMP_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS


def fetch_fmp_profile(ticker: str) -> dict | None:
    url = f"https://financialmodelingprep.com/api/v3/profile/{ticker}?apikey={FMP_API_KEY}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data and isinstance(data, list):
            return data[0]
    except Exception as e:
        print(f"  FMP error for {ticker}: {e}")
    return None


def seed_stocks():
    print(f"Seeding {len(SP100_TICKERS)} stocks...")
    success, failed = 0, []

    for ticker in SP100_TICKERS:
        profile = fetch_fmp_profile(ticker)
        if profile:
            row = {
                "ticker":   ticker,
                "name":     profile.get("companyName", ticker),
                "exchange": profile.get("exchangeShortName"),
                "sector":   profile.get("sector"),
                "logo_url": profile.get("image"),
            }
        else:
            row = {"ticker": ticker, "name": ticker}
            failed.append(ticker)

        supabase.table("stocks").upsert(row).execute()
        print(f"  {'OK' if profile else 'FALLBACK'} {ticker}: {row.get('name')}")
        time.sleep(0.3)  # FMP rate limit

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
        # Only insert if partner doesn't exist yet
        existing = supabase.table("affiliate_links").select("id").eq("partner", link["partner"]).execute()
        if not existing.data:
            supabase.table("affiliate_links").insert(link).execute()
            print(f"  Inserted {link['partner']}")
        else:
            print(f"  Skip {link['partner']} (already exists)")


if __name__ == "__main__":
    seed_stocks()
    seed_affiliate_links()
