"""Shared NYSE full-day holiday lookup used by scheduled price jobs."""

import json
from datetime import date
from pathlib import Path


_HOLIDAY_FILE = Path(__file__).resolve().parents[1] / "data" / "us-market-holidays.json"
with _HOLIDAY_FILE.open(encoding="utf-8") as holiday_file:
    _HOLIDAYS = {item["date"]: item["label"] for item in json.load(holiday_file)}


def get_market_holiday(value: date) -> str | None:
    return _HOLIDAYS.get(value.isoformat())


def is_market_holiday(value: date) -> bool:
    return get_market_holiday(value) is not None
