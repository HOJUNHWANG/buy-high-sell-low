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
ONE_TIME_EVENTS = sorted(
    (
        {**event, "start_date": date.fromisoformat(event["startDate"])}
        for event in CONFIG.get("oneTimeEvents", [])
    ),
    key=lambda event: event["start_date"],
)
ONE_TIME_EVENTS_BY_DATE = {event["start_date"]: event for event in ONE_TIME_EVENTS}

for scheduled_event in ONE_TIME_EVENTS:
    if scheduled_event["definitionId"] not in DEFINITIONS_BY_ID:
        raise ValueError(f"Unknown one-time major event definition: {scheduled_event['definitionId']}")

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


def _build_cycle_event(
    definition: dict,
    start_date: date,
    trigger_probability_pct: float,
    namespace: str = "cycle",
) -> dict:
    day_key = start_date.isoformat()
    event_key = f"major:{namespace}:{day_key}:{definition['id']}"
    requested_duration_days = integer_from_seed(
        f"{event_key}:duration",
        CYCLE["minDurationDays"],
        CYCLE["maxDurationDays"],
    )
    natural_end_date = start_date + timedelta(days=requested_duration_days - 1)
    next_reserved_event = next(
        (
            event
            for event in ONE_TIME_EVENTS
            if event.get("truncatePreviousEvent", False)
            and event["start_date"] > start_date
            and event["start_date"] <= natural_end_date
        ),
        None,
    )
    end_date = (
        next_reserved_event["start_date"] - timedelta(days=1)
        if next_reserved_event
        else natural_end_date
    )

    return {
        "event_key": event_key,
        "definition_id": definition["id"],
        "start_date": start_date,
        "end_date": end_date,
        "duration_days": (end_date - start_date).days + 1,
        "target_index": hash_string(f"{event_key}:target"),
        "trigger_probability_pct": trigger_probability_pct,
    }


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
        one_time_event = ONE_TIME_EVENTS_BY_DATE.get(market_date)

        if not one_time_event and _simulated_active_event and market_date <= _simulated_active_event["end_date"]:
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

        day_key = market_date.isoformat()

        if one_time_event:
            definition = DEFINITIONS_BY_ID[one_time_event["definitionId"]]
            evaluated_probability = 100
            roll_pct = None
            _simulated_active_event = _build_cycle_event(
                definition,
                market_date,
                100,
                "scheduled",
            )
            _simulated_probability = 0
        else:
            evaluated_probability = clamp(
                _simulated_probability + CYCLE["dailyProbabilityIncrementPct"],
                0,
                100,
            )
            roll_pct = seeded_noise(f"major:cycle:roll:{day_key}", 0, 100)

            if roll_pct < evaluated_probability:
                definition = DEFINITIONS[abs(hash_string(f"major:cycle:type:{day_key}")) % len(DEFINITIONS)]
                _simulated_active_event = _build_cycle_event(
                    definition,
                    market_date,
                    evaluated_probability,
                )
                _simulated_probability = 0
            else:
                _simulated_probability = evaluated_probability

        _cycle_cache[market_date] = {
            "market_date": market_date,
            "probability_pct": 0 if _simulated_active_event else _simulated_probability,
            "evaluated_probability_pct": evaluated_probability,
            "roll_pct": None if roll_pct is None else round(roll_pct, 4),
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
