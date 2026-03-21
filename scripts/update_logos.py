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

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, CRYPTO_TICKERS

# ── Crypto logos ──
CRYPTO_ICON_BASE = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color"

CRYPTO_LOGO_MAP = {
    "BTC-USD": f"{CRYPTO_ICON_BASE}/btc.png",
    "ETH-USD": f"{CRYPTO_ICON_BASE}/eth.png",
    "BNB-USD": f"{CRYPTO_ICON_BASE}/bnb.png",
    "SOL-USD": f"{CRYPTO_ICON_BASE}/sol.png",
    "XRP-USD": f"{CRYPTO_ICON_BASE}/xrp.png",
    "ADA-USD": f"{CRYPTO_ICON_BASE}/ada.png",
    "DOGE-USD": f"{CRYPTO_ICON_BASE}/doge.png",
    "AVAX-USD": f"{CRYPTO_ICON_BASE}/avax.png",
    "DOT-USD": f"{CRYPTO_ICON_BASE}/dot.png",
    "MATIC-USD": f"{CRYPTO_ICON_BASE}/matic.png",
    "LINK-USD": f"{CRYPTO_ICON_BASE}/link.png",
    "UNI-USD": f"{CRYPTO_ICON_BASE}/uni.png",
    "ATOM-USD": f"{CRYPTO_ICON_BASE}/atom.png",
    "LTC-USD": f"{CRYPTO_ICON_BASE}/ltc.png",
    "FIL-USD": f"{CRYPTO_ICON_BASE}/fil.png",
    "AAVE-USD": f"{CRYPTO_ICON_BASE}/aave.png",
    # Not on spothq CDN — use CoinGecko static assets
    "NEAR-USD": "https://assets.coingecko.com/coins/images/10365/small/near.jpg",
    "APT-USD": "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png",
    "ARB-USD": "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
    "OP-USD": "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
}

# ── Stock logos via Clearbit (free, domain-based) ──
STOCK_DOMAINS = {
    "AAPL": "apple.com", "MSFT": "microsoft.com", "NVDA": "nvidia.com",
    "AMZN": "amazon.com", "GOOGL": "google.com", "META": "meta.com",
    "TSLA": "tesla.com", "BRK.B": "berkshirehathaway.com", "UNH": "unitedhealthgroup.com",
    "XOM": "exxonmobil.com", "LLY": "lilly.com", "JPM": "jpmorganchase.com",
    "JNJ": "jnj.com", "V": "visa.com", "PG": "pg.com", "MA": "mastercard.com",
    "HD": "homedepot.com", "CVX": "chevron.com", "MRK": "merck.com",
    "ABBV": "abbvie.com", "PEP": "pepsico.com", "COST": "costco.com",
    "AVGO": "broadcom.com", "KO": "coca-cola.com", "WMT": "walmart.com",
    "BAC": "bankofamerica.com", "MCD": "mcdonalds.com", "ACN": "accenture.com",
    "TMO": "thermofisher.com", "CRM": "salesforce.com", "CSCO": "cisco.com",
    "ABT": "abbott.com", "LIN": "linde.com", "DHR": "danaher.com",
    "NEE": "nexteraenergy.com", "TXN": "ti.com", "NKE": "nike.com",
    "PM": "pmi.com", "ORCL": "oracle.com", "RTX": "rtx.com",
    "HON": "honeywell.com", "UPS": "ups.com", "IBM": "ibm.com",
    "AMGN": "amgen.com", "QCOM": "qualcomm.com", "LOW": "lowes.com",
    "INTU": "intuit.com", "SPGI": "spglobal.com", "CAT": "caterpillar.com",
    "GE": "ge.com", "BA": "boeing.com", "GS": "goldmansachs.com",
    "MS": "morganstanley.com", "BLK": "blackrock.com", "AMAT": "appliedmaterials.com",
    "ISRG": "intuitive.com", "AXP": "americanexpress.com", "DE": "deere.com",
    "SYK": "stryker.com", "MDLZ": "mondelezinternational.com", "ADI": "analog.com",
    "GILD": "gilead.com", "MMC": "marshmclennan.com", "SCHW": "schwab.com",
    "ELV": "elevancehealth.com", "ZTS": "zoetis.com", "C": "citigroup.com",
    "ADP": "adp.com", "TJX": "tjx.com", "MO": "altria.com",
    "CI": "thecignagroup.com", "CB": "chubb.com", "SO": "southerncompany.com",
    "DUK": "duke-energy.com", "CL": "colgatepalmolive.com", "BDX": "bd.com",
    "ITW": "itw.com", "EOG": "eogresources.com", "BSX": "bostonscientific.com",
    "WM": "wm.com", "PLD": "prologis.com", "CME": "cmegroup.com",
    "NOC": "northropgrumman.com", "TGT": "target.com", "USB": "usbank.com",
    "EMR": "emerson.com", "F": "ford.com", "GM": "gm.com",
    "PNC": "pnc.com", "NSC": "norfolksouthern.com", "ICE": "ice.com",
    "AON": "aon.com", "MCO": "moodys.com", "HUM": "humana.com",
    "REGN": "regeneron.com", "VRTX": "vrtx.com", "PANW": "paloaltonetworks.com",
    "SNPS": "synopsys.com", "CDNS": "cadence.com",
}


def update_crypto_logos():
    print("Updating crypto logos...")
    updated = 0
    for ticker, logo_url in CRYPTO_LOGO_MAP.items():
        supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
        print(f"  {ticker}: OK")
        updated += 1
    print(f"Crypto logos updated: {updated}/{len(CRYPTO_LOGO_MAP)}")


def update_stock_logos():
    """Use Google Favicon service (free, always available, no API key)."""
    # Only update stocks that don't have a logo yet
    result = supabase.table("stocks").select("ticker").is_("logo_url", "null").neq("sector", "Cryptocurrency").execute()
    missing = [r["ticker"] for r in result.data]
    if not missing:
        print("\nAll stocks already have logos!")
        return

    print(f"\nUpdating logos for {len(missing)} stocks via Google Favicon...")
    updated, failed = 0, 0

    for ticker in missing:
        domain = STOCK_DOMAINS.get(ticker)
        if not domain:
            print(f"  {ticker}: no domain mapping, skipping")
            failed += 1
            continue

        # Google's favicon service — reliable, high-res, always available
        logo_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
        supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
        print(f"  {ticker}: OK ({domain})")
        updated += 1
        time.sleep(0.1)

    print(f"Stock logos updated: {updated}, failed: {failed}")


if __name__ == "__main__":
    update_crypto_logos()
    update_stock_logos()
