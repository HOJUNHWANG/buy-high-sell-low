"""
update_logos.py — One-time script to populate logo_url for stocks + crypto.
Usage: python scripts/update_logos.py
"""
import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TWELVE_DATA_API_KEY = os.environ.get("TWELVE_DATA_API_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, CRYPTO_TICKERS

# Crypto logos from cryptocurrency-icons CDN (GitHub, free, stable)
CRYPTO_ICON_BASE = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color"

# Map ticker to icon filename (lowercase symbol without -USD)
CRYPTO_LOGO_MAP = {
    "BTC-USD": "btc", "ETH-USD": "eth", "BNB-USD": "bnb", "SOL-USD": "sol",
    "XRP-USD": "xrp", "ADA-USD": "ada", "DOGE-USD": "doge", "AVAX-USD": "avax",
    "DOT-USD": "dot", "MATIC-USD": "matic", "LINK-USD": "link", "UNI-USD": "uni",
    "ATOM-USD": "atom", "LTC-USD": "ltc", "FIL-USD": "fil", "NEAR-USD": "near",
    "APT-USD": "apt", "ARB-USD": "arb", "OP-USD": "op", "AAVE-USD": "aave",
}


def update_crypto_logos():
    print("Updating crypto logos...")
    updated = 0
    for ticker, symbol in CRYPTO_LOGO_MAP.items():
        logo_url = f"{CRYPTO_ICON_BASE}/{symbol}.png"
        # Verify URL exists
        try:
            r = requests.head(logo_url, timeout=5)
            if r.status_code != 200:
                print(f"  {ticker}: icon not found at CDN, skipping")
                continue
        except Exception:
            print(f"  {ticker}: CDN check failed, using anyway")

        supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
        print(f"  {ticker} -> {symbol}.png")
        updated += 1

    print(f"Crypto logos updated: {updated}/{len(CRYPTO_LOGO_MAP)}")


def update_stock_logos():
    """Use Twelve Data /logo endpoint to fetch stock logos."""
    if not TWELVE_DATA_API_KEY:
        print("No TWELVE_DATA_API_KEY — skipping stock logos")
        return

    # Only update stocks that don't have a logo yet
    result = supabase.table("stocks").select("ticker").is_("logo_url", "null").neq("sector", "Cryptocurrency").execute()
    missing = [r["ticker"] for r in result.data]
    if not missing:
        print("All stocks already have logos!")
        return

    print(f"Updating logos for {len(missing)} stocks via Twelve Data...")
    updated, failed = 0, 0

    for ticker in missing:
        try:
            r = requests.get(
                "https://api.twelvedata.com/logo",
                params={"symbol": ticker, "apikey": TWELVE_DATA_API_KEY},
                timeout=10,
            )
            data = r.json()
            logo_url = data.get("url")
            if logo_url:
                supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
                print(f"  {ticker}: OK")
                updated += 1
            else:
                print(f"  {ticker}: no logo returned")
                failed += 1
        except Exception as e:
            print(f"  {ticker}: error — {e}")
            failed += 1
        time.sleep(0.3)  # respect rate limits

    print(f"Stock logos updated: {updated}, failed: {failed}")


if __name__ == "__main__":
    update_crypto_logos()
    update_stock_logos()
