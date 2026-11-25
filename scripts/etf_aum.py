"""Independent, dated ETF share-class AUM for Nasdaq outages."""

import re
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime
from functools import cached_property
from typing import Any, Mapping
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup, SoupStrainer

from market_calendar import is_market_holiday, previous_market_day, session_close_minutes


ETFIQ_AUM_URL = "https://etfiq.com/data/aum.json"
ETFIQ_DATED_SOURCES = ("issuer daily", "issuer page", "issuer month end", "shares times nav")
VANGUARD_MONTH_END_SOURCE = "etfiq.vanguard.month_end_aum"
VANGUARD_MONTH_END_FUNDS = {"VOO", "VTI", "VXUS"}
VANGUARD_REPORT_MAX_AGE_DAYS = 45
INVESCO_FUND_FEED_URL = "https://daggerok.github.io/Invesco/api/invesco/funds/{ticker}/meta.json"
INVESCO_CUSIPS = {"QQQ": "46090E103", "SOXQ": "46138G615"}
STATE_STREET_URL = "https://www.ssga.com/us/en/intermediary/etfs/"
STATE_STREET_FUNDS = {
    "DIA": "state-street-spdr-dow-jones-industrial-average-etf-trust-dia",
    "GLD": "spdr-gold-shares-gld",
    "SPY": "state-street-spdr-sp-500-etf-trust-spy",
    "XLK": "state-street-technology-select-sector-spdr-etf-xlk",
}
ISHARES_URL = "https://www.ishares.com/us/products/"
ISHARES_FUNDS = {
    "AGG": "239458/ishares-core-total-us-bond-market-etf",
    "IWM": "239710/ishares-russell-2000-etf",
    "OEF": "239723/ishares-sp-100-etf",
    "TLT": "239454/ishares-20-year-treasury-bond-etf",
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
    source = "etfiq.aum"
    if row.get("source") == "issuer month end" and ticker in VANGUARD_MONTH_END_FUNDS:
        profile = f"https://investor.vanguard.com/investment-products/etfs/profile/{ticker.lower()}"
        if (
            row.get("url") != profile
            or not str(row.get("asOfText", "")).startswith("shareClassTotalNetAssetsDate ")
        ):
            raise ValueError(f"ETFIQ has no Vanguard ETF share-class report for {ticker}")
        source = VANGUARD_MONTH_END_SOURCE
    return EtfAum(round(amount), as_of, source, ETFIQ_AUM_URL)


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


def _parse_ishares_aum(html: str, url: str) -> EtfAum:
    field = "keyFundFacts-totalNetAssetsFundLevel"
    page = BeautifulSoup(
        html, "html.parser",
        parse_only=SoupStrainer(attrs={"data-id": "keyFundFacts-row-totalNetAssetsFundLevel"}),
    )
    value = page.find(attrs={"data-id": f"{field}-data"})
    date_label = page.find(attrs={"data-id": f"{field}-asOf"})
    if value is None or date_label is None:
        raise ValueError("iShares has no dated USD net assets")
    amount = re.fullmatch(r"\$([0-9]+(?:,[0-9]{3})*)", value.get_text(strip=True))
    if amount is None:
        raise ValueError("iShares net assets are not a USD amount")
    as_of = datetime.strptime(date_label.get_text(strip=True), "as of %b %d, %Y").date()
    return EtfAum(int(amount[1].replace(",", "")), as_of, "ishares.etf.net_assets", url)


def _parse_invesco_feed(ticker: str, payload: Any, url: str) -> EtfAum:
    if not isinstance(payload, Mapping) or payload.get("ticker") != ticker:
        raise ValueError("Invesco feed did not return the requested ETF")
    identifiers = payload.get("identifiers")
    if not isinstance(identifiers, Mapping) or identifiers.get("cusip") != INVESCO_CUSIPS[ticker]:
        raise ValueError("Invesco feed returned a different share class")
    aum = payload.get("aum")
    if (
        not isinstance(aum, Mapping)
        or aum.get("source") != "Invesco fund API prices endpoint (net assets / market value)"
        or not str(aum.get("display", "")).startswith("$")
    ):
        raise ValueError("Invesco feed has no issuer-sourced USD net assets")
    amount = aum.get("value")
    if type(amount) not in (int, float) or not 1 <= amount < 2**63:
        raise ValueError("Invesco feed has no positive AUM")
    as_of = datetime.strptime(str(aum.get("asOfDate")), "%b %d %Y").date()
    return EtfAum(round(amount), as_of, "invesco.etf.net_assets.via_fund_feed", url)


def _valid_month_end_report(as_of: date, today: date) -> bool:
    return (
        as_of.day == monthrange(as_of.year, as_of.month)[1]
        and 0 < (today - as_of).days <= VANGUARD_REPORT_MAX_AGE_DAYS
    )


ISSUER_AUM_PAGES = {
    **{ticker: (STATE_STREET_URL + slug, _parse_state_street_aum) for ticker, slug in STATE_STREET_FUNDS.items()},
    **{ticker: (ISHARES_URL + slug, _parse_ishares_aum) for ticker, slug in ISHARES_FUNDS.items()},
}


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
        issuer_page = ISSUER_AUM_PAGES.get(ticker)
        if issuer_page:
            url, parse_aum = issuer_page
            try:
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                aum = parse_aum(response.text, url)
                if not 1 <= aum.amount < 2**63 or aum.as_of not in eligible_dates:
                    raise ValueError(f"{aum.source} has no usable USD AUM for {ticker} as of {aum.as_of}")
                return aum
            except (requests.RequestException, ValueError, OverflowError) as exc:
                errors.append(str(exc))

        if ticker in INVESCO_CUSIPS:
            url = INVESCO_FUND_FEED_URL.format(ticker=ticker)
            try:
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                aum = _parse_invesco_feed(ticker, response.json(), url)
                if aum.as_of not in eligible_dates:
                    raise ValueError(f"Invesco feed AUM for {ticker} is dated {aum.as_of}")
                return aum
            except (requests.RequestException, ValueError) as exc:
                errors.append(str(exc))

        try:
            funds, error = self._etfiq_funds
            if error:
                raise ValueError(error)
            aum = _parse_etfiq_aum(ticker, funds.get(ticker))
            if aum.source == VANGUARD_MONTH_END_SOURCE:
                if not _valid_month_end_report(aum.as_of, now.astimezone(EASTERN).date()):
                    raise ValueError(f"Vanguard month-end AUM dated {aum.as_of} is outside its publication window")
                return aum
            if aum.as_of not in eligible_dates:
                raise ValueError(f"ETFIQ AUM dated {aum.as_of} is outside the usable window ending {latest}")
            return aum
        except ValueError as exc:
            errors.append(str(exc))
            raise ValueError("; ".join(errors)) from exc
