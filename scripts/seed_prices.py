"""
seed_prices.py — One-time price seed using direct Yahoo chart data.
Populates stock_prices + stock_price_history regardless of market hours.
"""
import os
import sys
import time
from datetime import datetime, timezone
import requests
from requests.exceptions import SSLError
import urllib3
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ALL_EQUITY_TICKERS, to_yf

HTTP_TIMEOUT_SECONDS = 30
VERIFY_HTTP_SSL = os.environ.get("BHSL_VERIFY_HTTP_SSL", "1").lower() not in {"0", "false", "no"}


def request_with_ssl_fallback(url: str, *, params: dict | None = None):
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        res = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=VERIFY_HTTP_SSL,
        )
        res.raise_for_status()
        return res
    except SSLError as e:
        if not VERIFY_HTTP_SSL:
            raise e
        print("  SSL verify failed; retrying without certificate verification...")
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        res = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=False,
        )
        res.raise_for_status()
        return res


def fetch_chart(ticker: str) -> dict | None:
    now = int(time.time())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{to_yf(ticker)}"
    params = {
        "period1": now - 10 * 24 * 60 * 60,
        "period2": now,
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    }
    try:
        payload = request_with_ssl_fallback(url, params=params).json()
    except Exception as e:
        print(f"  FAIL {ticker}: Yahoo chart request failed: {e}")
        return None

    result = (payload.get("chart", {}).get("result") or [None])[0]
    if not result:
        print(f"  FAIL {ticker}: no chart data")
        return None
    return result


def rest_headers(extra: dict | None = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def supabase_rest(method: str, path: str, *, json_body):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{path}"
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    res = requests.request(
        method,
        url,
        json=json_body,
        headers=rest_headers(),
        timeout=HTTP_TIMEOUT_SECONDS,
        verify=False,
    )
    res.raise_for_status()
    return res


def upsert_stock_price(row: dict):
    try:
        supabase.table("stock_prices").upsert(row).execute()
    except Exception:
        url = "stock_prices?on_conflict=ticker"
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        res = requests.post(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{url}",
            json=[row],
            headers=rest_headers({"Prefer": "resolution=merge-duplicates"}),
            timeout=HTTP_TIMEOUT_SECONDS,
            verify=False,
        )
        res.raise_for_status()


def insert_price_history(row: dict):
    try:
        supabase.table("stock_price_history").insert(row).execute()
    except Exception:
        supabase_rest("POST", "stock_price_history", json_body=row)


def main():
    tickers = [t.upper() for t in sys.argv[1:]] if len(sys.argv) > 1 else ALL_EQUITY_TICKERS
    print(f"Fetching latest prices for {len(tickers)} tickers via direct Yahoo chart...")

    now = datetime.utcnow().isoformat()
    fetched, failed = 0, []

    for ticker in tickers:
        try:
            result = fetch_chart(ticker)
            if not result:
                failed.append(ticker)
                continue

            meta = result.get("meta") or {}
            timestamps = result.get("timestamp") or []
            quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
            closes = [c for c in (quote.get("close") or []) if c is not None]
            if len(closes) < 2:
                failed.append(ticker)
                continue

            price = float(meta.get("regularMarketPrice") or closes[-1])
            prev = float(meta.get("chartPreviousClose") or closes[-2])
            change_pct = round((price - prev) / prev * 100, 4) if prev != 0 else 0.0
            volume = meta.get("regularMarketVolume")

            upsert_stock_price({
                "ticker":     ticker,
                "price":      price,
                "change_pct": change_pct,
                "volume":     int(volume) if volume is not None else None,
                "fetched_at": now,
            })

            # Insert last 5 days of history
            inserted_history = 0
            for idx, ts in enumerate(timestamps[-5:]):
                close = (quote.get("close") or [None])[len(timestamps) - len(timestamps[-5:]) + idx]
                if close is None:
                    continue
                insert_price_history({
                    "ticker":      ticker,
                    "price":       float(close),
                    "recorded_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
                })
                inserted_history += 1

            print(
                f"  OK {ticker}: ${price:.2f} "
                f"({'+' if change_pct >= 0 else ''}{change_pct:.2f}%, history {inserted_history})"
            )
            fetched += 1
        except Exception as e:
            print(f"  FAIL {ticker}: {e}")
            failed.append(ticker)

        time.sleep(0.3)

    print(f"\nDone. {fetched} inserted, {len(failed)} failed: {failed}")

if __name__ == "__main__":
    main()
