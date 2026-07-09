"""
seed_fictional_history.py - Backfill 1 year of daily OHLCV for fictional companies.

Safe to re-run. Rows are upserted on (ticker, date).
"""
import math
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "fictional-market.ts"
T = 1_000_000_000_000
B = 1_000_000_000
CHUNK_INSERT = 500

load_dotenv(dotenv_path=ROOT / ".env.local")
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def split_fields(body: str) -> list[str]:
    fields, current = [], []
    in_quote = False
    quote_char = ""
    for char in body:
        if char in ('"', "'") and (not current or current[-1] != "\\"):
            if in_quote and char == quote_char:
                in_quote = False
            elif not in_quote:
                in_quote = True
                quote_char = char
        if char == "," and not in_quote:
            fields.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if current:
        fields.append("".join(current).strip())
    return fields


def parse_value(raw: str):
    raw = raw.strip()
    if raw.startswith('"') and raw.endswith('"'):
        return raw[1:-1]
    return eval(raw, {"__builtins__": {}}, {"T": T, "B": B})


def load_companies() -> list[dict]:
    companies = []
    pattern = re.compile(r"^\s*\{\s*ticker:\s*")
    for line in DATA_FILE.read_text(encoding="utf-8").splitlines():
        if not pattern.match(line):
            continue
        body = line.strip().removeprefix("{").removesuffix("},")
        row = {}
        for field in split_fields(body):
            key, value = field.split(":", 1)
            row[key.strip()] = parse_value(value)
        companies.append({
            "ticker": row["ticker"],
            "base_price": float(row["basePrice"]),
            "float_shares": float(row["floatShares"]),
            "volatility": float(row["volatility"]),
            "influence": int(row["influence"]),
            "technology": int(row["technology"]),
            "sector": row["sector"],
            "risk": row["risk"],
        })
    if len(companies) != 100:
        raise RuntimeError(f"Expected 100 fictional companies, found {len(companies)}")
    return companies


def hash_string(value: str) -> int:
    hash_value = 2166136261
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return hash_value


def seeded_noise(seed: str, low: float = -1, high: float = 1) -> float:
    x = math.sin(hash_string(seed)) * 10000
    fraction = x - math.floor(x)
    return low + fraction * (high - low)


def risk_multiplier(risk: str) -> float:
    return {
        "Low": 0.62,
        "Moderate": 0.82,
        "High": 1.08,
        "Extreme": 1.35,
        "Existential": 1.65,
    }[risk]


def trading_days(end: date, days_back: int = 366) -> list[date]:
    start = end - timedelta(days=days_back)
    days = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def daily_return(company: dict, day: date) -> float:
    day_key = day.isoformat()
    market = seeded_noise(f"hist:market:{day_key}", -0.55, 0.62)
    sector = seeded_noise(f"hist:sector:{company['sector']}:{day_key}", -0.42, 0.42)
    company_pulse = seeded_noise(f"hist:company:{company['ticker']}:{day_key}", -1, 1)
    event_roll = seeded_noise(f"hist:event-roll:{company['ticker']}:{day_key}", 0, 1)
    event_chance = 0.015 if company["risk"] == "Moderate" else 0.025 if company["risk"] == "High" else 0.04
    event = 0
    if event_roll < event_chance:
        direction = 1 if seeded_noise(f"hist:event-dir:{company['ticker']}:{day_key}", -1, 1) >= 0 else -1
        event = direction * seeded_noise(f"hist:event-impact:{company['ticker']}:{day_key}", 1.1, company["volatility"] * 1.4 + 1.8)
    drift = (company["technology"] - 78) / 800
    raw = market * (0.7 + company["influence"] / 210) + sector + company_pulse * company["volatility"] * 0.18 + event + drift
    max_move = 12 if company["risk"] == "Existential" else 9 if company["risk"] == "Extreme" else 6
    return max(-max_move, min(max_move, raw * risk_multiplier(company["risk"])))


def build_rows(company: dict, days: list[date]) -> list[dict]:
    anchor = len(days) - 1
    price = company["base_price"]
    reverse_rows = []

    # Walk backward first so today's generated close lands near the configured base price.
    for day in reversed(days):
        ret = daily_return(company, day)
        prev_close = max(0.5, price / (1 + ret / 100))
        open_price = prev_close * (1 + seeded_noise(f"hist:gap:{company['ticker']}:{day}", -0.9, 0.9) / 100)
        high = max(open_price, price) * (1 + abs(seeded_noise(f"hist:high:{company['ticker']}:{day}", 0.05, 1.4)) / 100)
        low = min(open_price, price) * (1 - abs(seeded_noise(f"hist:low:{company['ticker']}:{day}", 0.05, 1.4)) / 100)
        volume_base = company["float_shares"] * (0.0012 + company["volatility"] / 1450)
        volume = round(volume_base * (0.65 + abs(ret) / 11 + seeded_noise(f"hist:vol:{company['ticker']}:{day}", -0.18, 0.24)))
        reverse_rows.append({
            "ticker": company["ticker"],
            "date": day.isoformat(),
            "open": round(open_price, 4),
            "high": round(high, 4),
            "low": round(max(0.5, low), 4),
            "close": round(price, 4),
            "volume": max(1, volume),
        })
        price = prev_close

    rows = list(reversed(reverse_rows))
    if len(rows) != len(days):
        raise RuntimeError(f"Bad row count for {company['ticker']}: {len(rows)} != {len(days)}")
    return rows


def main():
    requested = {arg.upper() for arg in sys.argv[1:]}
    companies = load_companies()
    if requested:
        companies = [company for company in companies if company["ticker"] in requested]
    days = trading_days(datetime.now(timezone.utc).date())
    print(f"Seeding {len(companies)} fictional tickers with {len(days)} daily rows each")

    total = 0
    for company in companies:
        rows = build_rows(company, days)
        for i in range(0, len(rows), CHUNK_INSERT):
            chunk = rows[i:i + CHUNK_INSERT]
            supabase.table("fictional_price_history_daily").upsert(
                chunk, on_conflict="ticker,date"
            ).execute()
        total += len(rows)
        print(f"  OK {company['ticker']}: {len(rows)} rows")

    supabase.rpc("cleanup_fictional_market_data").execute()
    print(f"Done. Upserted {total} fictional daily rows")


if __name__ == "__main__":
    main()
