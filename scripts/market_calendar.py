"""Shared NYSE full-day holiday lookup used by scheduled price jobs."""

import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
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


def quote_session_date(data: dict, *, observed_at: str, ingested_at: datetime, is_crypto: bool) -> date:
    """Provider session identity is independent of the day a worker runs."""
    zone=ZoneInfo("UTC" if is_crypto else "America/New_York")
    raw=str(data.get("datetime") or "")[:10]
    candidate=date.fromisoformat(raw) if raw else datetime.fromisoformat(observed_at).astimezone(zone).date()
    if candidate>ingested_at.astimezone(zone).date():raise ValueError("provider session is in the future")
    if not is_crypto and (candidate.weekday()>=5 or is_market_holiday(candidate)):
        if raw:raise ValueError("provider supplied a non-trading session")
        candidate=previous_market_day(candidate)
    return candidate


with (_HOLIDAY_FILE.parent / "us-market-early-closes.json").open(encoding="utf8") as source:
    _EARLY_CLOSES = {row["date"]:row["closeMinute"] for row in json.load(source)}


def session_close_minutes(value: date) -> int:
    return _EARLY_CLOSES.get(value.isoformat(),960)
