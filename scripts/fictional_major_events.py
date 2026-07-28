"""Deterministic accumulating-probability event cycle shared by market scripts."""

from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "data" / "fictional-major-events.json").read_text(encoding="utf-8"))
DEFINITIONS = CONFIG["events"]
DEFINITIONS_BY_ID = {event["id"]: event for event in DEFINITIONS}
CYCLE = CONFIG["cycle"]
ANCHOR_DATE = date.fromisoformat(CYCLE["anchorDate"])

RISK_SENSITIVITY = {
    "Low": 0.78,
    "Moderate": 0.9,
    "High": 1.04,
    "Extreme": 1.18,
    "Existential": 1.32,
}

_cycle_cache: dict[date, dict] = {}
_simulated_through = ANCHOR_DATE - timedelta(days=1)
_simulated_probability = 0.0
_simulated_active_event: dict | None = None
_simulated_last_event_end: date | None = None


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


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


def integer_from_seed(seed: str, low: int, high: int) -> int:
    return math.floor(seeded_noise(seed, low, high + 1))


def _ensure_cycle_through(target_date: date) -> dict:
    global _simulated_through
    global _simulated_probability
    global _simulated_active_event
    global _simulated_last_event_end

    if target_date < ANCHOR_DATE:
        return {
            "market_date": target_date,
            "probability_pct": 0,
            "evaluated_probability_pct": 0,
            "roll_pct": None,
            "active_event": None,
            "last_event_end_date": None,
        }

    while _simulated_through < target_date:
        market_date = _simulated_through + timedelta(days=1)

        if _simulated_active_event and market_date <= _simulated_active_event["end_date"]:
            _cycle_cache[market_date] = {
                "market_date": market_date,
                "probability_pct": 0,
                "evaluated_probability_pct": 0,
                "roll_pct": None,
                "active_event": _simulated_active_event,
                "last_event_end_date": _simulated_last_event_end,
            }
            _simulated_through = market_date
            continue

        if _simulated_active_event:
            _simulated_last_event_end = _simulated_active_event["end_date"]
            _simulated_active_event = None

        evaluated_probability = clamp(
            _simulated_probability + CYCLE["dailyProbabilityIncrementPct"],
            0,
            100,
        )
        day_key = market_date.isoformat()
        roll_pct = seeded_noise(f"major:cycle:roll:{day_key}", 0, 100)

        if roll_pct < evaluated_probability:
            definition = DEFINITIONS[abs(hash_string(f"major:cycle:type:{day_key}")) % len(DEFINITIONS)]
            event_key = f"major:cycle:{day_key}:{definition['id']}"
            duration_days = integer_from_seed(
                f"{event_key}:duration",
                CYCLE["minDurationDays"],
                CYCLE["maxDurationDays"],
            )
            _simulated_active_event = {
                "event_key": event_key,
                "definition_id": definition["id"],
                "start_date": market_date,
                "end_date": market_date + timedelta(days=duration_days - 1),
                "duration_days": duration_days,
                "target_index": hash_string(f"{event_key}:target"),
                "trigger_probability_pct": evaluated_probability,
            }
            _simulated_probability = 0
        else:
            _simulated_probability = evaluated_probability

        _cycle_cache[market_date] = {
            "market_date": market_date,
            "probability_pct": 0 if _simulated_active_event else _simulated_probability,
            "evaluated_probability_pct": evaluated_probability,
            "roll_pct": round(roll_pct, 4),
            "active_event": _simulated_active_event,
            "last_event_end_date": _simulated_last_event_end,
        }
        _simulated_through = market_date

    return _cycle_cache[target_date]


def _target_ticker(event: dict, companies: list[dict]) -> str | None:
    definition = DEFINITIONS_BY_ID[event["definition_id"]]
    if definition["scope"] != "company" or not companies:
        return None
    stable_tickers = sorted(company["ticker"] for company in companies)
    return stable_tickers[event["target_index"] % len(stable_tickers)]


def _raw_daily_impact(definition: dict, event: dict, company: dict, elapsed_days: int) -> dict:
    duration_days = event["duration_days"]
    progress = 1 if duration_days <= 1 else elapsed_days / (duration_days - 1)
    magnitude = seeded_noise(
        f"{event['event_key']}:magnitude",
        definition["impactPct"][0],
        definition["impactPct"][1],
    )
    volatility = seeded_noise(
        f"{event['event_key']}:volatility",
        definition["volatility"][0],
        definition["volatility"][1],
    )
    shock_decay = 0.34 + 0.66 * math.exp(-2.1 * progress)
    turbulence_curve = 0.58 + 0.42 * math.sin(math.pi * progress)
    if definition["scope"] == "company":
        exposure = definition.get("targetImpact", -1)
    else:
        exposure = definition.get("broadImpact", 0) + definition.get("sectorImpacts", {}).get(company["sector"], 0)
    sensitivity = RISK_SENSITIVITY[company["risk"]] * (0.9 + company["volatility"] / 28)
    directional_impact = magnitude * exposure * shock_decay * sensitivity
    current_date = event["start_date"] + timedelta(days=elapsed_days)
    whipsaw = (
        seeded_noise(f"{event['event_key']}:{company['ticker']}:{current_date.isoformat()}:whipsaw", -1, 1)
        * magnitude
        * volatility
        * turbulence_curve
        * 0.34
        * sensitivity
    )
    return {
        "impact_pct": clamp(directional_impact + whipsaw, -12, 12),
        "volatility_boost": clamp(
            volatility * turbulence_curve * (0.72 + abs(exposure) * 0.22),
            0.25,
            2.2,
        ),
    }


def _capped_impact_path(definition: dict, event: dict, company: dict, through_day: int) -> dict:
    cumulative_factor = 1.0
    current_impact_pct = 0.0
    volatility_boost = 0.0

    for elapsed_day in range(through_day + 1):
        raw = _raw_daily_impact(definition, event, company, elapsed_day)
        proposed_factor = cumulative_factor * (1 + raw["impact_pct"] / 100)
        bounded_cumulative_pct = clamp(
            (proposed_factor - 1) * 100,
            -CYCLE["cumulativeImpactCapPct"],
            CYCLE["cumulativeImpactCapPct"],
        )
        bounded_factor = 1 + bounded_cumulative_pct / 100
        current_impact_pct = (bounded_factor / cumulative_factor - 1) * 100
        cumulative_factor = bounded_factor
        volatility_boost = raw["volatility_boost"]

    return {
        "current_impact_pct": round(current_impact_pct, 4),
        "cumulative_impact_pct": round((cumulative_factor - 1) * 100, 4),
        "volatility_boost": round(volatility_boost, 4),
    }


def active_major_events(company: dict, current_date: date, companies: list[dict] | None = None) -> list[dict]:
    universe = companies or [company]
    state = _ensure_cycle_through(current_date)
    event = state["active_event"]
    if not event:
        return []

    definition = DEFINITIONS_BY_ID[event["definition_id"]]
    target_ticker = _target_ticker(event, universe)
    if definition["scope"] == "company" and company["ticker"] != target_ticker:
        return []

    elapsed_days = (current_date - event["start_date"]).days
    if elapsed_days < 0 or elapsed_days >= event["duration_days"]:
        return []
    impact = _capped_impact_path(definition, event, company, elapsed_days)
    day_number = elapsed_days + 1
    company_name = company.get("name", company["ticker"])
    headline = definition["headline"].replace("{company}", company_name)

    return [{
        "event_key": event["event_key"],
        "definition_id": definition["id"],
        "scope": definition["scope"],
        "category": definition["category"],
        "title": definition["title"],
        "headline": f"[MAJOR EVENT · {definition['category']} · Day {day_number}/{event['duration_days']}] {headline}",
        "start_date": event["start_date"].isoformat(),
        "end_date": event["end_date"].isoformat(),
        "duration_days": event["duration_days"],
        "day_number": day_number,
        "days_remaining": event["duration_days"] - day_number,
        "target_ticker": target_ticker,
        "trigger_probability_pct": event["trigger_probability_pct"],
        "current_impact_pct": impact["current_impact_pct"],
        "cumulative_impact_pct": impact["cumulative_impact_pct"],
        "cumulative_impact_cap_pct": CYCLE["cumulativeImpactCapPct"],
        "volatility_boost": impact["volatility_boost"],
        "volume_multiplier": round(clamp(
            1 + abs(impact["current_impact_pct"]) / 5 + impact["volatility_boost"] * 0.55,
            1.2,
            4,
        ), 3),
    }]


def major_event_impact(company: dict, current_date: date, companies: list[dict] | None = None) -> dict:
    events = active_major_events(company, current_date, companies)
    primary_event = events[0] if events else None
    return {
        "impact_pct": primary_event["current_impact_pct"] if primary_event else 0,
        "cumulative_impact_pct": primary_event["cumulative_impact_pct"] if primary_event else 0,
        "volatility_boost": primary_event["volatility_boost"] if primary_event else 0,
        "volume_multiplier": primary_event["volume_multiplier"] if primary_event else 1,
        "active_events": events,
        "primary_event": primary_event,
    }
