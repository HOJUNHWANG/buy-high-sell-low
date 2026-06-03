"""
seed_etfs.py — Seed ETFs: stocks table + 1-year history + logos + market caps.
All-in-one script for ETFs only (fast, ~10 tickers).

Usage: python scripts/seed_etfs.py
Primary history source: Twelve Data (same provider as price cron)
Fallback history source: yfinance (local, 1-time use)
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
TWELVE_DATA_API_KEY = os.environ.get("TWELVE_DATA_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ETF_TICKERS, COMPANY_NAMES

# ETF logo domains for DuckDuckGo favicon
ETF_DOMAINS = {
    "VOO": "vanguard.com", "SPY": "ssga.com", "QQQ": "invesco.com", "VTI": "vanguard.com",
    "DIA": "ssga.com", "IWM": "ishares.com", "AGG": "ishares.com",
    "XLK": "ssga.com", "XLF": "ssga.com", "XLE": "ssga.com", "XLV": "ssga.com",
    "XLI": "ssga.com", "XLP": "ssga.com", "XLY": "ssga.com", "XLU": "ssga.com",
    "XLRE": "ssga.com", "XLC": "ssga.com", "XLB": "ssga.com",
    "TLT": "ishares.com", "BND": "vanguard.com", "HYG": "ishares.com",
    "GLD": "ssga.com", "SLV": "ishares.com", "USO": "uscfinvestments.com",
    "EFA": "ishares.com", "EEM": "ishares.com",
    "ARKK": "ark-invest.com", "SOXX": "ishares.com", "XBI": "ssga.com",
}

# Manual AUM-style fallbacks used only when Yahoo/yfinance is rate-limited.
# Exact AUM changes over time; the price cron/history data remains provider-sourced.
ETF_MARKET_CAP_FALLBACKS = {
    "VOO": 1_300_000_000_000,
    "QQQ": 380_000_000_000,
    "SPY": 650_000_000_000,
    "VTI": 500_000_000_000,
    "IWM": 70_000_000_000,
    "DIA": 40_000_000_000,
    "GLD": 100_000_000_000,
    "TLT": 50_000_000_000,
    "AGG": 120_000_000_000,
    "XLK": 90_000_000_000,
}

CHUNK_INSERT = 500
TWELVE_HISTORY_SLEEP_SECONDS = 1.3
YFINANCE_MARKET_CAP_SLEEP_SECONDS = 3.0


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


def upsert_history_rows(ticker: str, rows: list[dict]) -> int:
    """Upsert normalized OHLCV rows into price_history_long."""
    inserted = 0
    for i in range(0, len(rows), CHUNK_INSERT):
        chunk = rows[i:i + CHUNK_INSERT]
        try:
            supabase.table("price_history_long").upsert(
                chunk, on_conflict="ticker,date"
            ).execute()
            inserted += len(chunk)
        except Exception as e:
            print(f"    {ticker} chunk error: {e}")
    return inserted


def fetch_twelve_history(ticker: str) -> list[dict]:
    """Fetch 1-year daily OHLCV history from Twelve Data."""
    if not TWELVE_DATA_API_KEY:
        raise RuntimeError("TWELVE_DATA_API_KEY is not set")

    response = requests.get(
        "https://api.twelvedata.com/time_series",
        params={
            "symbol": ticker,
            "interval": "1day",
            "outputsize": 365,
            "apikey": TWELVE_DATA_API_KEY,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") == "error":
        raise RuntimeError(payload.get("message", "Twelve Data returned an error"))

    values = payload.get("values") or []
    rows = []
    for value in values:
        close = value.get("close")
        if close in (None, ""):
            continue
        row = {
            "ticker": ticker,
            "date": value["datetime"][:10],
            "close": round(float(close), 4),
        }
        for source_key, db_key in [("open", "open"), ("high", "high"), ("low", "low")]:
            raw = value.get(source_key)
            if raw not in (None, ""):
                row[db_key] = round(float(raw), 4)
        raw_volume = value.get("volume")
        if raw_volume not in (None, ""):
            row["volume"] = int(float(raw_volume))
        rows.append(row)

    return rows


def fetch_yfinance_history(ticker: str) -> list[dict]:
    """Fallback history fetch from yfinance for local/manual runs."""
    ticker_data = yf.download(
        ticker,
        period="1y",
        interval="1d",
        progress=False,
        auto_adjust=True,
        threads=False,
    )
    if ticker_data.empty:
        return []

    # Newer yfinance versions can return MultiIndex columns even for one symbol.
    if getattr(ticker_data.columns, "nlevels", 1) > 1:
        try:
            ticker_data = ticker_data.xs(ticker, axis=1, level=-1, drop_level=True)
        except (KeyError, ValueError):
            ticker_data.columns = ticker_data.columns.get_level_values(0)

    closes = ticker_data["Close"].dropna()
    rows = []
    for ts in closes.index:
        row = {
            "ticker": ticker,
            "date": ts.strftime("%Y-%m-%d"),
            "close": round(float(ticker_data["Close"].loc[ts]), 4),
        }
        for col, key in [("Open", "open"), ("High", "high"), ("Low", "low")]:
            try:
                val = float(ticker_data[col].loc[ts])
                if val == val:
                    row[key] = round(val, 4)
            except (KeyError, TypeError, ValueError):
                pass
        try:
            vol = ticker_data["Volume"].loc[ts]
            if vol == vol:
                row["volume"] = int(vol)
        except (KeyError, TypeError, ValueError):
            pass
        rows.append(row)
    return rows


def seed_etf_history():
    """Download 1 year of daily OHLCV data for ETFs."""
    print(f"\nSeeding 1-year history for {len(ETF_TICKERS)} ETFs...")
    if TWELVE_DATA_API_KEY:
        print("  Using Twelve Data history endpoint first (avoids Yahoo/yfinance 429s).")
    else:
        print("  TWELVE_DATA_API_KEY not set; falling back to yfinance history.")

    total_inserted = 0
    for ticker in ETF_TICKERS:
        rows: list[dict] = []
        try:
            rows = fetch_twelve_history(ticker)
        except Exception as twelve_error:
            print(f"  {ticker}: Twelve Data history unavailable — {twelve_error}")
            try:
                rows = fetch_yfinance_history(ticker)
            except Exception as yf_error:
                print(f"  SKIP {ticker}: yfinance fallback failed — {yf_error}")
                rows = []

        if not rows:
            print(f"  SKIP {ticker}: no history data")
        else:
            inserted = upsert_history_rows(ticker, rows)
            total_inserted += inserted
            print(f"  OK {ticker}: {inserted} days upserted")

        if TWELVE_DATA_API_KEY:
            time.sleep(TWELVE_HISTORY_SLEEP_SECONDS)

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
    """Fetch ETF AUM-style market caps with manual fallback for Yahoo rate limits."""
    print(f"\nUpdating market caps for {len(ETF_TICKERS)} ETFs...")
    updated, failed = 0, 0

    for ticker in ETF_TICKERS:
        market_cap = None
        try:
            info = yf.Ticker(ticker).info
            # ETFs usually expose totalAssets instead of marketCap.
            market_cap = info.get("totalAssets") or info.get("netAssets") or info.get("marketCap")
        except Exception as e:
            print(f"  {ticker}: yfinance market cap unavailable — {e}")

        if not market_cap:
            market_cap = ETF_MARKET_CAP_FALLBACKS.get(ticker)
            if market_cap:
                print(f"  {ticker}: using manual AUM fallback")

        if market_cap:
            supabase.table("stocks").update({"market_cap": market_cap}).eq("ticker", ticker).execute()
            print(f"  {ticker}: ${market_cap:,.0f}")
            updated += 1
        else:
            print(f"  {ticker}: no market cap data")
            failed += 1
        time.sleep(YFINANCE_MARKET_CAP_SLEEP_SECONDS)

    print(f"Market caps: {updated} OK, {failed} failed")


if __name__ == "__main__":
    seed_etf_stocks()
    seed_etf_history()
    update_etf_logos()
    update_etf_market_caps()
    print("\nAll ETF seeding complete!")
