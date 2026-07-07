"""Shared NYSE full-day holiday lookup used by scheduled price jobs."""

import json
from datetime import date, timedelta
from pathlib import Path


_HOLIDAY_FILE = Path(__file__).resolve().parents[1] / "data" / "us-market-holidays.json"
with _HOLIDAY_FILE.open(encoding="utf-8") as holiday_file:
    _HOLIDAYS = {item["date"]: item["label"] for item in json.load(holiday_file)}


def get_market_holiday(value: date) -> str | None:
    return _HOLIDAYS.get(value.isoformat())


def is_market_holiday(value: date) -> bool:
    return get_market_holiday(value) is not None


def previous_market_day(value: date) -> date:
    """Return the previous weekday that is not a configured market holiday."""
    candidate = value - timedelta(days=1)
    while candidate.weekday() >= 5 or is_market_holiday(candidate):
        candidate -= timedelta(days=1)
    return candidate
