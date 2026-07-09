"""
update_fictional_market.py - Seed and update the fictional market tables.

Schedule suggestion:
- every 30-60 minutes for fictional_prices and fictional_price_history
- once daily after market close for fictional_price_history_daily
"""
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "fictional-market.ts"
T = 1_000_000_000_000
B = 1_000_000_000

load_dotenv(dotenv_path=ROOT / ".env.local")
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def split_fields(body: str) -> list[str]:
    fields: list[str] = []
    current: list[str] = []
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


def fictional_market_scale(row: dict) -> float:
    civilizational = {"CHOAM", "BNLG"}
    interstellar = {"WYUT", "STK", "SAKR", "KDYD", "RDA", "SHRA"}
    planetary = {"ARSK", "MLTC", "WNTE", "LEX", "WLLC", "ROXX", "PCHM", "MCRP", "RSI", "UAC", "CEC"}

    if row["ticker"] in civilizational:
        return 8
    if row["ticker"] in interstellar:
        return 5
    if row["ticker"] in planetary:
        return 3.5
    if row["exchange"] == "LUNA" or row["sector"] == "Space":
        return 2.8
    if row["sector"] == "Megacorp" or int(row["influence"]) >= 90:
        return 2.4
    if row["risk"] in ("Existential", "Extreme"):
        return 2
    if float(row["marketCap"]) >= T:
        return 1.8
    return 1.35


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
        scale = fictional_market_scale(row)
        companies.append({
            "ticker": row["ticker"],
            "name": row["name"],
            "source": row["source"],
            "exchange": row["exchange"],
            "sector": row["sector"],
            "risk": row["risk"],
            "market_cap": int(row["marketCap"] * scale),
            "base_price": float(row["basePrice"]),
            "float_shares": float(row["floatShares"]) * scale,
            "volatility": float(row["volatility"]),
            "influence": int(row["influence"]),
            "technology": int(row["technology"]),
            "color": row["color"],
            "accent": row["accent"],
            "note": row["note"],
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


def build_price_row(company: dict, now: datetime) -> dict:
    day = now.date().isoformat()
    market_pulse = seeded_noise(f"market:{day}", -0.9, 0.9)
    company_pulse = seeded_noise(f"{company['ticker']}:{day}", -1, 1)
    sector_pulse = seeded_noise(f"{company['sector']}:{day}", -0.55, 0.55)
    event_pulse = seeded_noise(f"event:{company['ticker']}:{day}", -1.4, 1.4)
    risk = company["risk"]
    risk_multiplier = 1.7 if risk == "Existential" else 1.35 if risk == "Extreme" else 1.12 if risk == "High" else 0.82
    change_pct = round((market_pulse + sector_pulse + company_pulse * company["volatility"] + event_pulse) * risk_multiplier, 2)
    price = round(max(0.5, company["base_price"] * (1 + change_pct / 100)), 2)
    volume_base = company["float_shares"] * (0.0018 + company["volatility"] / 1000)
    volume = round(volume_base * (1 + abs(change_pct) / 18 + seeded_noise(f"volume:{company['ticker']}:{day}", -0.18, 0.22)))
    pe_ratio = None if company["sector"] == "Finance" or risk == "Existential" else round(18 + company["technology"] / 6 + seeded_noise(f"pe:{company['ticker']}:{day}", -4, 5), 1)
    dividend_yield = round(max(0, seeded_noise(f"yield:{company['ticker']}:{day}", 0.2, 3.6)), 2) if company["sector"] in ("Energy", "Finance", "Industrial") else None
    return {
        "ticker": company["ticker"],
        "price": price,
        "change_pct": change_pct,
        "volume": volume,
        "pe_ratio": pe_ratio,
        "dividend_yield": dividend_yield,
        "fetched_at": now.isoformat(),
    }


def main():
    now = datetime.now(timezone.utc)
    companies = load_companies()
    price_rows = [build_price_row(company, now) for company in companies]
    price_by_ticker = {row["ticker"]: row for row in price_rows}
    dynamic_companies = [
        {
            **company,
            "market_cap": int(price_by_ticker[company["ticker"]]["price"] * company["float_shares"]),
        }
        for company in companies
    ]
    history_rows = [
        {
            "ticker": row["ticker"],
            "recorded_at": now.isoformat(),
            "price": row["price"],
            "change_pct": row["change_pct"],
            "volume": row["volume"],
        }
        for row in price_rows
    ]
    daily_rows = [
        {
            "ticker": row["ticker"],
            "date": now.date().isoformat(),
            "open": next(company["base_price"] for company in companies if company["ticker"] == row["ticker"]),
            "high": max(row["price"], next(company["base_price"] for company in companies if company["ticker"] == row["ticker"])),
            "low": min(row["price"], next(company["base_price"] for company in companies if company["ticker"] == row["ticker"])),
            "close": row["price"],
            "volume": row["volume"],
        }
        for row in price_rows
    ]
    event_rows = [
        {
            "event_key": f"{now.date().isoformat()}:{row['ticker']}",
            "ticker": row["ticker"],
            "headline": f"{row['ticker']} moved {row['change_pct']:+.2f}% on fictional market flow.",
            "impact_pct": row["change_pct"],
            "severity": "chaotic" if abs(row["change_pct"]) >= 7 else "material" if abs(row["change_pct"]) >= 3.5 else "routine",
            "event_at": now.isoformat(),
        }
        for row in sorted(price_rows, key=lambda item: abs(item["change_pct"]), reverse=True)[:12]
    ]

    supabase.table("fictional_companies").upsert(dynamic_companies, on_conflict="ticker").execute()
    supabase.table("fictional_prices").upsert(price_rows, on_conflict="ticker").execute()
    supabase.table("fictional_price_history").insert(history_rows).execute()
    supabase.table("fictional_price_history_daily").upsert(daily_rows, on_conflict="ticker,date").execute()
    supabase.table("fictional_market_events").upsert(event_rows, on_conflict="event_key").execute()
    supabase.rpc("cleanup_fictional_market_data").execute()

    print(f"Updated fictional market: {len(companies)} companies, {len(price_rows)} prices, {len(event_rows)} events")


if __name__ == "__main__":
    main()
