"""Independent, dated ETF share-class AUM for Nasdaq outages."""

import re
from dataclasses import dataclass
from datetime import date, datetime
from functools import cached_property
from typing import Any, Mapping
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from market_calendar import is_market_holiday, previous_market_day, session_close_minutes


ETFIQ_AUM_URL = "https://etfiq.com/data/aum.json"
ETFIQ_DATED_SOURCES = ("issuer daily", "issuer page", "issuer month end", "shares times nav")
STATE_STREET_URL = "https://www.ssga.com/us/en/intermediary/etfs/"
STATE_STREET_FUNDS = {
    "DIA": "state-street-spdr-dow-jones-industrial-average-etf-trust-dia",
    "GLD": "spdr-gold-shares-gld",
    "SPY": "state-street-spdr-sp-500-etf-trust-spy",
    "XLK": "state-street-technology-select-sector-spdr-etf-xlk",
}
EASTERN = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class EtfAum:
    amount: int
    as_of: date
    source: str
    url: str


def last_completed_session(now: datetime) -> date:
    eastern = now.astimezone(EASTERN)
    today = eastern.date()
    minutes = eastern.hour * 60 + eastern.minute
    if (
        today.weekday() >= 5
        or is_market_holiday(today)
        or minutes < session_close_minutes(today)
    ):
        return previous_market_day(today)
    return today


def _parse_etfiq_aum(ticker: str, row: Any) -> EtfAum:
    if (
        not isinstance(row, Mapping)
        or row.get("basis") != "as of"
        or row.get("source") not in ETFIQ_DATED_SOURCES
    ):
        raise ValueError(f"ETFIQ has no issuer-based share-class AUM for {ticker}")
    amount = row.get("aum")
    if type(amount) not in (int, float) or not 1 <= amount < 2**63:
        raise ValueError(f"ETFIQ has no positive USD AUM for {ticker}")
    as_of = date.fromisoformat(str(row.get("asOf")))
    return EtfAum(round(amount), as_of, "etfiq.aum", ETFIQ_AUM_URL)


def _parse_state_street_aum(html: str, url: str) -> EtfAum:
    page = BeautifulSoup(html, "html.parser")
    for label in page.select("div.label"):
        if label.get_text(strip=True) != "Assets Under Management":
            continue
        value = label.find_next_sibling("div", class_="data")
        date_label = label.find_next_sibling("div", class_="date")
        if value is None or date_label is None:
            continue
        match = re.fullmatch(
            r"\$((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s+([MBT])",
            value.get_text(strip=True),
        )
        if match is None:
            continue
        scale = {"M": 10**6, "B": 10**9, "T": 10**12}[match[2]]
        amount = round(float(match[1].replace(",", "")) * scale)
        as_of = datetime.strptime(date_label.get_text(strip=True), "as of %b %d %Y").date()
        return EtfAum(amount, as_of, "statestreet.etf.aum", url)
    raise ValueError("State Street has no dated USD AUM")


class EtfAumProvider:
    def __init__(self, session: requests.Session):
        self.session = session

    @cached_property
    def _etfiq_funds(self) -> tuple[Mapping[str, Any], str | None]:
        try:
            response = self.session.get(ETFIQ_AUM_URL, timeout=10)
            response.raise_for_status()
            payload = response.json()
            funds = payload.get("funds") if isinstance(payload, Mapping) else None
            if not isinstance(funds, Mapping) or not funds:
                raise ValueError("ETFIQ response has no fund records")
            return funds, None
        except (requests.RequestException, ValueError) as exc:
            return {}, str(exc)

    def fetch(self, ticker: str, *, now: datetime) -> EtfAum:
        latest = last_completed_session(now)
        eligible_dates = {latest, previous_market_day(latest)}
        errors = []
        slug = STATE_STREET_FUNDS.get(ticker)
        if slug:
            url = STATE_STREET_URL + slug
            try:
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                aum = _parse_state_street_aum(response.text, url)
                if not 1 <= aum.amount < 2**63 or aum.as_of not in eligible_dates:
                    raise ValueError(f"State Street has no usable USD AUM for {ticker} as of {aum.as_of}")
                return aum
            except (requests.RequestException, ValueError, OverflowError) as exc:
                errors.append(str(exc))

        try:
            funds, error = self._etfiq_funds
            if error:
                raise ValueError(error)
            aum = _parse_etfiq_aum(ticker, funds.get(ticker))
            if aum.as_of not in eligible_dates:
                raise ValueError(f"ETFIQ AUM dated {aum.as_of} is outside the usable window ending {latest}")
            return aum
        except ValueError as exc:
            errors.append(str(exc))
            raise ValueError("; ".join(errors)) from exc
