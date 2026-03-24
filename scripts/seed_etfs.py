"""
seed_etfs.py — Seed ETFs: stocks table + 1-year history + logos + market caps.
All-in-one script for ETFs only (fast, ~25 tickers).

Usage: python scripts/seed_etfs.py
Data source: yfinance (local, 1-time use)
"""
import os
import sys
import time
import requests
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ETF_TICKERS, COMPANY_NAMES

# ETF logo domains for DuckDuckGo favicon
ETF_DOMAINS = {
    "SPY": "ssga.com", "QQQ": "invesco.com", "DIA": "ssga.com", "IWM": "ishares.com",
    "XLK": "ssga.com", "XLF": "ssga.com", "XLE": "ssga.com", "XLV": "ssga.com",
    "XLI": "ssga.com", "XLP": "ssga.com", "XLY": "ssga.com", "XLU": "ssga.com",
    "XLRE": "ssga.com", "XLC": "ssga.com", "XLB": "ssga.com",
    "TLT": "ishares.com", "BND": "vanguard.com", "HYG": "ishares.com",
    "GLD": "ssga.com", "SLV": "ishares.com", "USO": "uscfinvestments.com",
    "EFA": "ishares.com", "EEM": "ishares.com",
    "ARKK": "ark-invest.com", "SOXX": "ishares.com", "XBI": "ssga.com",
}

CHUNK_INSERT = 500


def seed_etf_stocks():
    """Insert ETF entries into the stocks table with sector='ETF'."""
    print(f"Seeding {len(ETF_TICKERS)} ETFs into stocks table...")
    for ticker in ETF_TICKERS:
        name = COMPANY_NAMES.get(ticker, ticker)
        row = {
            "ticker": ticker,
            "name": name,
            "exchange": "NYSE ARCA",
            "sector": "ETF",
        }
        supabase.table("stocks").upsert(row).execute()
        print(f"  OK {ticker}: {name}")
    print(f"Done. {len(ETF_TICKERS)} ETFs seeded.")


def seed_etf_history():
    """Download 1 year of daily OHLCV data for ETFs."""
    print(f"\nSeeding 1-year history for {len(ETF_TICKERS)} ETFs...")

    tickers_str = " ".join(ETF_TICKERS)
    try:
        data = yf.download(
            tickers_str,
            period="1y",
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
    for ticker in ETF_TICKERS:
        try:
            if len(ETF_TICKERS) == 1:
                ticker_data = data
            else:
                ticker_data = data[ticker]

            closes = ticker_data["Close"].dropna()
            if closes.empty:
                print(f"  SKIP {ticker}: no data")
                continue

            rows = []
            for ts in closes.index:
                date_str = ts.strftime("%Y-%m-%d")
                row = {
                    "ticker": ticker,
                    "date": date_str,
                    "close": round(float(ticker_data["Close"].loc[ts]), 4),
                }
                for col, key in [("Open", "open"), ("High", "high"), ("Low", "low")]:
                    try:
                        val = float(ticker_data[col].loc[ts])
                        if val == val:
                            row[key] = round(val, 4)
                    except (KeyError, TypeError):
                        pass
                try:
                    vol = ticker_data["Volume"].loc[ts]
                    if vol == vol:
                        row["volume"] = int(vol)
                except (KeyError, TypeError):
                    pass
                rows.append(row)

            if not rows:
                print(f"  OK {ticker}: no rows")
                continue

            inserted = 0
            for i in range(0, len(rows), CHUNK_INSERT):
                chunk = rows[i:i + CHUNK_INSERT]
                try:
                    supabase.table("price_history_long").upsert(
                        chunk, on_conflict="ticker,date"
                    ).execute()
                    inserted += len(chunk)
                except Exception as e:
                    print(f"    chunk error: {e}")

            total_inserted += inserted
            print(f"  OK {ticker}: {inserted} days upserted")

        except Exception as e:
            print(f"  FAIL {ticker}: {e}")

    print(f"\nHistory done. {total_inserted} total rows upserted.")


def update_etf_logos():
    """Fetch ETF logos via DuckDuckGo favicon service."""
    print(f"\nUpdating logos for {len(ETF_TICKERS)} ETFs...")
    updated, fallback = 0, 0

    for ticker in ETF_TICKERS:
        domain = ETF_DOMAINS.get(ticker)
        if not domain:
            print(f"  {ticker}: no domain mapping")
            fallback += 1
            continue

        logo_url = f"https://icons.duckduckgo.com/ip3/{domain}.ico"
        try:
            r = requests.get(logo_url, timeout=5)
            if r.status_code == 200 and len(r.content) > 200:
                supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
                print(f"  {ticker}: OK ({domain}, {len(r.content)}B)")
                updated += 1
            else:
                supabase.table("stocks").update({"logo_url": None}).eq("ticker", ticker).execute()
                print(f"  {ticker}: too small, letter fallback")
                fallback += 1
        except Exception as e:
            print(f"  {ticker}: error — {e}")
            fallback += 1
        time.sleep(0.1)

    print(f"Logos: {updated} OK, {fallback} letter fallback")


def update_etf_market_caps():
    """Fetch market caps (total assets) for ETFs via yfinance."""
    print(f"\nUpdating market caps for {len(ETF_TICKERS)} ETFs...")
    updated, failed = 0, 0

    for ticker in ETF_TICKERS:
        try:
            info = yf.Ticker(ticker).info
            # ETFs use totalAssets instead of marketCap
            market_cap = info.get("totalAssets") or info.get("marketCap")
            if market_cap:
                supabase.table("stocks").update({"market_cap": market_cap}).eq("ticker", ticker).execute()
                print(f"  {ticker}: ${market_cap:,.0f}")
                updated += 1
            else:
                print(f"  {ticker}: no market cap data")
                failed += 1
        except Exception as e:
            print(f"  {ticker}: error — {e}")
            failed += 1
        time.sleep(0.5)

    print(f"Market caps: {updated} OK, {failed} failed")


if __name__ == "__main__":
    seed_etf_stocks()
    seed_etf_history()
    update_etf_logos()
    update_etf_market_caps()
    print("\nAll ETF seeding complete!")
