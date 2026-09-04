"""Audit stored market data against external references.

The production price job uses Twelve Data, so Nasdaq and CoinGecko provide an
independent price check. Market-value checks re-read the primary external
reference and verify that the validated write reached the database unchanged.

Market-data tables are read-only.  A compact operational result is appended to
``fetch_logs`` when a service-role key is available so persistent failures can
be surfaced in the admin Data Health page. Exit codes remain suitable for cron
or CI monitoring:

* 0: audit completed without a critical finding
* 1: at least one confirmed critical mismatch/missing/stale stored value
* 2: the audit could not be completed (configuration or reference outage)

Examples:
    python scripts/audit_market_data.py
    python scripts/audit_market_data.py --ticker MU --verbose
    python scripts/audit_market_data.py --asset-class crypto --json
    python scripts/audit_market_data.py --ticker MU --no-log
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, replace
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from time import sleep
from typing import Any, Callable, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from market_calendar import is_market_holiday, previous_market_day
from tickers import ETF_TICKERS


EXIT_OK = 0
EXIT_CRITICAL = 1
EXIT_INCOMPLETE = 2
AUDIT_LOG_JOB_NAME = "market_data_audit"

DEFAULT_PRICE_WARNING_PCT = 0.5
DEFAULT_PRICE_CRITICAL_PCT = 2.0
DEFAULT_CAP_WARNING_PCT = 2.0
# A roughly 9.7% DOGE market-cap error previously slipped through. Treat a
# 5% discrepancy as critical while retaining a smaller warning band for normal
# provider timing differences.
DEFAULT_CAP_CRITICAL_PCT = 5.0
DEFAULT_EQUITY_PRICE_MAX_AGE_HOURS = 96.0
DEFAULT_CRYPTO_PRICE_MAX_AGE_HOURS = 1.0
DEFAULT_CAP_MAX_AGE_HOURS = 36.0
DEFAULT_REFERENCE_MAX_AGE_HOURS = 96.0
DEFAULT_CRYPTO_REFERENCE_MAX_AGE_HOURS = 1.0
DEFAULT_TIMEOUT_SECONDS = 30.0
REFERENCE_ATTEMPTS = 2
REFERENCE_RETRY_DELAY_SECONDS = 0.5
# CoinGecko's one-day chart contains five-minute observations.
CRYPTO_ALIGNMENT_MAX_SKEW_SECONDS = 5 * 60

ASSET_EQUITY = "equity"
ASSET_ETF = "etf"
ASSET_CRYPTO = "crypto"
ASSET_CLASSES = (ASSET_EQUITY, ASSET_ETF, ASSET_CRYPTO)

NASDAQ_STOCKS_URL = "https://api.nasdaq.com/api/screener/stocks"
NASDAQ_ETF_INFO_URL = "https://api.nasdaq.com/api/quote/{ticker}/info"
NASDAQ_ETF_SUMMARY_URL = "https://api.nasdaq.com/api/quote/{ticker}/summary"
NASDAQ_ETF_HISTORY_URL = "https://api.nasdaq.com/api/quote/{ticker}/historical"
COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price"
COINGECKO_CHART_URL = "https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"

NASDAQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
}

COINGECKO_IDS = {
    "BTC-USD": "bitcoin",
    "ETH-USD": "ethereum",
    "USDT-USD": "tether",
    "BNB-USD": "binancecoin",
    "USDC-USD": "usd-coin",
    "XRP-USD": "ripple",
    "SOL-USD": "solana",
    "TRX-USD": "tron",
    "DOGE-USD": "dogecoin",
    "ZEC-USD": "zcash",
    "ADA-USD": "cardano",
    "XLM-USD": "stellar",
    "XMR-USD": "monero",
    "LINK-USD": "chainlink",
    "BCH-USD": "bitcoin-cash",
    "AVAX-USD": "avalanche-2",
    "LTC-USD": "litecoin",
    "DOT-USD": "polkadot",
    "AAVE-USD": "aave",
}


@dataclass(frozen=True)
class StoredAsset:
    ticker: str
    name: str
    asset_class: str
    price: float | None
    price_fetched_at: datetime | None
    market_cap: float | None
    market_cap_as_of: date | None
    market_cap_updated_at: datetime | None = None
    market_cap_source: str | None = None
    market_cap_metric: str | None = None


@dataclass(frozen=True)
class ReferenceQuote:
    ticker: str
    source: str
    price: float | None
    market_cap: float | None
    as_of: datetime | None
    price_as_of: datetime | None = None
    market_cap_as_of: datetime | None = None
    alignment_notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    ticker: str
    field: str
    message: str
    stored_value: float | None = None
    reference_value: float | None = None
    deviation_pct: float | None = None


@dataclass(frozen=True)
class AssetComparison:
    ticker: str
    asset_class: str
    source: str | None
    stored_price: float | None
    reference_price: float | None
    price_deviation_pct: float | None
    stored_market_cap: float | None
    reference_market_cap: float | None
    market_cap_deviation_pct: float | None
    price_fetched_at: datetime | None
    market_cap_as_of: date | None
    reference_as_of: datetime | None
    price_reference_as_of: datetime | None = None
    market_cap_reference_as_of: datetime | None = None


@dataclass(frozen=True)
class AuditConfig:
    price_warning_pct: float = DEFAULT_PRICE_WARNING_PCT
    price_critical_pct: float = DEFAULT_PRICE_CRITICAL_PCT
    cap_warning_pct: float = DEFAULT_CAP_WARNING_PCT
    cap_critical_pct: float = DEFAULT_CAP_CRITICAL_PCT
    equity_price_max_age_hours: float = DEFAULT_EQUITY_PRICE_MAX_AGE_HOURS
    crypto_price_max_age_hours: float = DEFAULT_CRYPTO_PRICE_MAX_AGE_HOURS
    cap_max_age_hours: float = DEFAULT_CAP_MAX_AGE_HOURS
    reference_max_age_hours: float = DEFAULT_REFERENCE_MAX_AGE_HOURS
    crypto_reference_max_age_hours: float = (
        DEFAULT_CRYPTO_REFERENCE_MAX_AGE_HOURS
    )


@dataclass
class AuditReport:
    generated_at: datetime
    comparisons: list[AssetComparison]
    findings: list[Finding]
    provider_errors: list[str]
    incomplete: bool = False

    @property
    def critical_count(self) -> int:
        return sum(item.severity == "critical" for item in self.findings)

    @property
    def warning_count(self) -> int:
        return sum(item.severity == "warning" for item in self.findings)

    @property
    def exit_code(self) -> int:
        if self.critical_count:
            return EXIT_CRITICAL
        if self.incomplete or self.provider_errors:
            return EXIT_INCOMPLETE
        return EXIT_OK

    @property
    def status(self) -> str:
        if self.critical_count:
            return "CRITICAL"
        if self.incomplete or self.provider_errors:
            return "INCOMPLETE"
        return "PASS"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "exit_code": self.exit_code,
            "generated_at": self.generated_at.isoformat(),
            "summary": {
                "assets": len(self.comparisons),
                "critical": self.critical_count,
                "warnings": self.warning_count,
                "provider_errors": len(self.provider_errors),
                "price_reference_coverage": sum(
                    item.reference_price is not None for item in self.comparisons
                ),
                "market_cap_reference_coverage": sum(
                    item.reference_market_cap is not None
                    for item in self.comparisons
                ),
            },
            "provider_errors": self.provider_errors,
            "findings": [_json_safe(asdict(item)) for item in self.findings],
            "comparisons": [
                _json_safe(asdict(item)) for item in self.comparisons
            ],
        }


def build_audit_log_payload(report: AuditReport) -> dict[str, Any]:
    """Build a bounded operational log without duplicating all comparisons."""
    result = report.to_dict()
    summary = result["summary"]
    if report.status == "CRITICAL":
        failed_tickers = sorted(
            {
                finding.ticker
                for finding in report.findings
                if finding.severity == "critical"
            }
        )
    elif report.status == "INCOMPLETE":
        failed_tickers = sorted({finding.ticker for finding in report.findings})
    else:
        failed_tickers = []

    details = {
        "schema_version": 1,
        "audit_status": report.status,
        "exit_code": report.exit_code,
        "generated_at": result["generated_at"],
        "summary": summary,
        "provider_errors": result["provider_errors"],
        "findings": result["findings"],
    }
    failure_count = len(failed_tickers)
    if report.status != "PASS" and failure_count == 0:
        failure_count = max(1, len(report.provider_errors))

    return {
        "job_name": AUDIT_LOG_JOB_NAME,
        "status": {
            "PASS": "success",
            "CRITICAL": "critical",
            "INCOMPLETE": "incomplete",
        }[report.status],
        "records_fetched": len(report.comparisons),
        "records_failed": failure_count,
        "failed_tickers": failed_tickers or None,
        "error_message": json.dumps(
            details, sort_keys=True, separators=(",", ":")
        ),
        "executed_at": report.generated_at.isoformat(),
    }


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def classify_asset(ticker: str) -> str:
    ticker = ticker.upper()
    if ticker.endswith("-USD"):
        return ASSET_CRYPTO
    if ticker in ETF_TICKERS:
        return ASSET_ETF
    return ASSET_EQUITY


def parse_number(value: Any) -> float | None:
    """Parse common provider number formats without accepting NaN/Infinity."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
    else:
        text = str(value).strip()
        if not text or text.upper() in {"N/A", "NA", "NONE", "NULL", "--"}:
            return None
        negative = text.startswith("(") and text.endswith(")")
        text = re.sub(r"[$,%()]", "", text).replace(",", "").strip()
        multiplier = 1.0
        if text and text[-1].upper() in {"K", "M", "B", "T"}:
            multiplier = {
                "K": 1e3,
                "M": 1e6,
                "B": 1e9,
                "T": 1e12,
            }[text[-1].upper()]
            text = text[:-1]
        try:
            parsed = float(text) * multiplier
        except (TypeError, ValueError):
            return None
        if negative:
            parsed = -parsed
    return parsed if math.isfinite(parsed) else None


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_nasdaq_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.strptime(str(value), "%m/%d/%Y %I:%M:%S %p")
    except ValueError:
        return None
    return parsed.replace(tzinfo=ZoneInfo("America/New_York")).astimezone(
        timezone.utc
    )


def parse_nasdaq_quote_datetime(value: Any) -> datetime | None:
    """Parse Nasdaq's per-symbol live-quote timestamp as an ET instant."""
    if not value:
        return None
    text = re.sub(r"^Closed at\s+", "", str(value).strip())
    text = re.sub(r"\s+(?:ET|EST|EDT)$", "", text)
    for pattern in (
        "%b %d, %Y %I:%M %p",
        "%b %d, %Y %I:%M:%S %p",
        "%m/%d/%Y %I:%M:%S %p",
    ):
        try:
            parsed = datetime.strptime(text, pattern)
            return parsed.replace(
                tzinfo=ZoneInfo("America/New_York")
            ).astimezone(timezone.utc)
        except ValueError:
            continue

    # Nasdaq removes the clock portion from ETF quote timestamps during its
    # nightly rollover (for example, ``Aug 6, 2026`` after 9 PM ET). The audit
    # still needs the exchange-session date to validate the quote. Represent
    # that date at the regular-session close instead of using the audit time,
    # which would make an old quote appear artificially fresh.
    try:
        session_date = datetime.strptime(text, "%b %d, %Y")
        parsed = session_date.replace(hour=16)
        return parsed.replace(
            tzinfo=ZoneInfo("America/New_York")
        ).astimezone(timezone.utc)
    except ValueError:
        pass
    return None


def expected_us_quote_session_date(now: datetime) -> date:
    """Return the US market session date a live quote must represent."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now_et = now.astimezone(ZoneInfo("America/New_York"))
    today = now_et.date()
    if (
        today.weekday() >= 5
        or is_market_holiday(today)
        or now_et.time() < time(9, 30)
    ):
        return previous_market_day(today)
    return today


def normalize_nasdaq_symbol(symbol: str) -> str:
    # Nasdaq uses BRK/B while the application uses BRK.B.
    return symbol.strip().upper().replace("/", ".")


def _nested_rows(payload: Mapping[str, Any]) -> Sequence[Mapping[str, Any]]:
    data = payload.get("data") or {}
    if isinstance(data, Mapping) and isinstance(data.get("rows"), list):
        return data["rows"]
    nested = data.get("data") if isinstance(data, Mapping) else None
    if isinstance(nested, Mapping) and isinstance(nested.get("rows"), list):
        return nested["rows"]
    return []


def parse_nasdaq_stock_payload(
    payload: Mapping[str, Any], requested: Iterable[str]
) -> dict[str, ReferenceQuote]:
    wanted = {ticker.upper() for ticker in requested}
    quotes: dict[str, ReferenceQuote] = {}
    for row in _nested_rows(payload):
        ticker = normalize_nasdaq_symbol(str(row.get("symbol") or ""))
        if ticker not in wanted:
            continue
        quotes[ticker] = ReferenceQuote(
            ticker=ticker,
            source="Nasdaq",
            price=parse_number(row.get("lastsale") or row.get("lastSalePrice")),
            market_cap=parse_number(row.get("marketCap")),
            # The stock screener currently exposes no reliable as-of timestamp.
            as_of=None,
        )
    return quotes


def parse_nasdaq_etf_quote(
    payload: Mapping[str, Any],
    ticker: str,
    *,
    expected_session: date | None = None,
    prefer_close: bool = False,
) -> ReferenceQuote | None:
    """Parse Nasdaq's per-symbol ETF quote (not its delayed ETF screener)."""
    data = payload.get("data") or {}
    if not isinstance(data, Mapping):
        return None
    keys = ("secondaryData", "primaryData") if prefer_close else ("primaryData",)
    for key in keys:
        row = data.get(key)
        if not isinstance(row, Mapping):
            continue
        timestamp = row.get("lastTradeTimestamp")
        # Secondary data can also be an extended-hours quote. Only use its
        # explicitly labelled regular-session close.
        if key == "secondaryData" and not str(timestamp).startswith("Closed at "):
            continue
        price = parse_number(row.get("lastSalePrice") or row.get("lastsalePrice"))
        as_of = parse_nasdaq_quote_datetime(timestamp)
        if price is None or price <= 0 or as_of is None:
            continue
        if expected_session is not None and as_of.astimezone(
            ZoneInfo("America/New_York")
        ).date() != expected_session:
            continue
        return ReferenceQuote(
            ticker=ticker.upper(),
            source=(
                "Nasdaq regular-session close + ETF summary"
                if key == "secondaryData"
                else "Nasdaq live quote + ETF summary"
            ),
            price=price,
            market_cap=None,
            as_of=as_of,
        )
    return None


def parse_nasdaq_etf_history(
    payload: Mapping[str, Any], ticker: str, session_date: date,
) -> ReferenceQuote | None:
    """Accept only the exact requested session's unadjusted closing price."""
    data = payload.get("data")
    table = data.get("tradesTable") if isinstance(data, Mapping) else None
    rows = table.get("rows") if isinstance(table, Mapping) else None
    if not isinstance(rows, list):
        return None
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        try:
            observed_date = datetime.strptime(str(row.get("date")), "%m/%d/%Y").date()
        except ValueError:
            continue
        price = parse_number(row.get("close"))
        if observed_date == session_date and price is not None and price > 0:
            return ReferenceQuote(
                ticker=ticker.upper(),
                source="Nasdaq historical close + ETF summary",
                price=price,
                market_cap=None,
                as_of=datetime.combine(
                    session_date, time(16), tzinfo=ZoneInfo("America/New_York")
                ),
            )
    return None


def parse_nasdaq_etf_aum(payload: Mapping[str, Any]) -> float | None:
    data = payload.get("data") or {}
    summary = data.get("summaryData") if isinstance(data, Mapping) else None
    aum = summary.get("AUM") if isinstance(summary, Mapping) else None
    if not isinstance(aum, Mapping):
        return None
    value = parse_number(aum.get("value"))
    if value is None or value <= 0:
        return None
    label = str(aum.get("label") or "").lower()
    # Nasdaq labels its ETF AUM value as "Assets Under Management (,000)".
    return value * 1_000 if "000" in label else value


def parse_coingecko_payload(
    payload: Mapping[str, Any], tickers: Iterable[str]
) -> dict[str, ReferenceQuote]:
    quotes: dict[str, ReferenceQuote] = {}
    for ticker in tickers:
        coin_id = COINGECKO_IDS.get(ticker.upper())
        row = payload.get(coin_id) if coin_id else None
        if not isinstance(row, Mapping):
            continue
        timestamp = parse_number(row.get("last_updated_at"))
        as_of = (
            datetime.fromtimestamp(timestamp, tz=timezone.utc)
            if timestamp is not None and timestamp > 0
            else None
        )
        quotes[ticker.upper()] = ReferenceQuote(
            ticker=ticker.upper(),
            source="CoinGecko",
            price=parse_number(row.get("usd")),
            market_cap=parse_number(row.get("usd_market_cap")),
            as_of=as_of,
        )
    return quotes


def create_http_session() -> requests.Session:
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        status=2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        backoff_factor=0.5,
        respect_retry_after_header=True,
    )
    session = requests.Session()
    if os.name == "nt":
        # Python's bundled certifi store may not contain enterprise roots that
        # Windows itself trusts. Use the OS trust store without disabling TLS
        # verification or leaking credentials into query strings.
        adapter: HTTPAdapter = SystemTrustHttpAdapter(
            ssl_context=ssl.create_default_context(), max_retries=retry
        )
    else:
        adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    return session


class SystemTrustHttpAdapter(HTTPAdapter):
    """Requests adapter backed by an explicit, system-trusted SSL context."""

    def __init__(self, *args: Any, ssl_context: ssl.SSLContext, **kwargs: Any) -> None:
        self.ssl_context = ssl_context
        super().__init__(*args, **kwargs)

    def init_poolmanager(
        self,
        connections: int,
        maxsize: int,
        block: bool = False,
        **pool_kwargs: Any,
    ) -> None:
        pool_kwargs["ssl_context"] = self.ssl_context
        super().init_poolmanager(connections, maxsize, block, **pool_kwargs)

    def proxy_manager_for(self, proxy: str, **proxy_kwargs: Any) -> Any:
        proxy_kwargs["ssl_context"] = self.ssl_context
        return super().proxy_manager_for(proxy, **proxy_kwargs)


class SupabaseReader:
    """Minimal PostgREST client that only exposes GET operations."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or create_http_session()
        self.headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def _get_rows(
        self, table: str, params: Mapping[str, str], page_size: int = 1_000
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page_params = dict(params)
            page_params.update({"limit": str(page_size), "offset": str(offset)})
            response = self.session.get(
                f"{self.base_url}/rest/v1/{table}",
                headers=self.headers,
                params=page_params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            page = response.json()
            if not isinstance(page, list):
                raise ValueError(f"Unexpected {table} response type")
            rows.extend(item for item in page if isinstance(item, dict))
            if len(page) < page_size:
                return rows
            offset += page_size

    def fetch_assets(
        self, *, now: datetime, cap_lookback_days: int = 30
    ) -> list[StoredAsset]:
        stocks = self._get_rows(
            "stocks",
            {
                "select": (
                    "ticker,name,market_cap,market_cap_updated_at,"
                    "market_cap_source,market_cap_metric"
                ),
                "is_active": "eq.true",
                "order": "ticker.asc",
            },
        )
        prices = self._get_rows(
            "stock_prices",
            {"select": "ticker,price,fetched_at"},
        )
        cutoff = (now.date() - timedelta(days=cap_lookback_days)).isoformat()
        snapshots = self._get_rows(
            "market_cap_snapshots",
            {
                "select": "ticker,date,market_cap",
                "date": f"gte.{cutoff}",
                "order": "date.desc,ticker.asc",
            },
        )

        price_by_ticker = {
            str(row.get("ticker") or "").upper(): row for row in prices
        }
        latest_snapshot: dict[str, date] = {}
        for row in snapshots:
            ticker = str(row.get("ticker") or "").upper()
            try:
                snapshot_date = date.fromisoformat(str(row.get("date")))
            except (TypeError, ValueError):
                continue
            if ticker and (
                ticker not in latest_snapshot
                or snapshot_date > latest_snapshot[ticker]
            ):
                latest_snapshot[ticker] = snapshot_date

        assets: list[StoredAsset] = []
        for row in stocks:
            ticker = str(row.get("ticker") or "").upper()
            if not ticker:
                continue
            price_row = price_by_ticker.get(ticker, {})
            assets.append(
                StoredAsset(
                    ticker=ticker,
                    name=str(row.get("name") or ticker),
                    asset_class=classify_asset(ticker),
                    price=parse_number(price_row.get("price")),
                    price_fetched_at=parse_datetime(price_row.get("fetched_at")),
                    market_cap=parse_number(row.get("market_cap")),
                    market_cap_as_of=latest_snapshot.get(ticker),
                    market_cap_updated_at=parse_datetime(
                        row.get("market_cap_updated_at")
                    ),
                    market_cap_source=(
                        str(row.get("market_cap_source"))
                        if row.get("market_cap_source")
                        else None
                    ),
                    market_cap_metric=(
                        str(row.get("market_cap_metric"))
                        if row.get("market_cap_metric")
                        else None
                    ),
                )
            )
        return assets


class SupabaseAuditLogWriter:
    """Append audit metadata only; never mutate prices or market values."""

    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or create_http_session()
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def record(self, report: AuditReport) -> None:
        response = self.session.post(
            f"{self.base_url}/rest/v1/fetch_logs",
            headers=self.headers,
            json=build_audit_log_payload(report),
            timeout=self.timeout,
        )
        response.raise_for_status()


class NasdaqReferenceProvider:
    def __init__(
        self,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self.timeout = timeout
        self.session = session or create_http_session()

    def _get_json(self, url: str, *, params: Mapping[str, str]) -> Any:
        response = self.session.get(
            url,
            headers=NASDAQ_HEADERS,
            params=params,
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, Mapping):
            raise ValueError("Unexpected Nasdaq response type")
        return payload

    def _usable(self, load: Callable[[], Any], label: str) -> Any:
        """Retry empty/invalid HTTP-200 data as well as transport failures."""
        for attempt in range(REFERENCE_ATTEMPTS):
            try:
                value = load()
                if value is not None and value != {}:
                    return value
                raise ValueError(label)
            except (requests.RequestException, ValueError, TypeError):
                if attempt + 1 == REFERENCE_ATTEMPTS:
                    raise
                sleep(REFERENCE_RETRY_DELAY_SECONDS)

    def fetch_equities(
        self, tickers: Sequence[str]
    ) -> tuple[dict[str, ReferenceQuote], list[str]]:
        if not tickers:
            return {}, []
        try:
            quotes = self._usable(
                lambda: parse_nasdaq_stock_payload(self._get_json(
                    NASDAQ_STOCKS_URL,
                    params={"tableonly": "true", "limit": "10000", "download": "true"},
                ), tickers),
                "Nasdaq equity reference returned no usable quotes",
            )
            return quotes, []
        except (requests.RequestException, ValueError, TypeError) as exc:
            return {}, [f"Nasdaq equity reference failed: {_safe_error(exc)}"]

    def fetch_etfs(
        self,
        tickers: Sequence[str],
        *,
        now: datetime | None = None,
    ) -> tuple[dict[str, ReferenceQuote], list[str]]:
        if not tickers:
            return {}, []
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        expected_session = expected_us_quote_session_date(now)
        now_et = now.astimezone(ZoneInfo("America/New_York"))
        # Daily history is suitable only for a completed session. Never use
        # yesterday's close to validate an open market's current price.
        session_completed = (
            expected_session < now_et.date() or now_et.time() >= time(16)
        )
        errors: list[str] = []
        quotes: dict[str, ReferenceQuote] = {}

        # ETF screener data can remain on the prior session after a new session
        # has closed. Fetch each tracked ETF's live quote and require its trade
        # timestamp to identify the expected session before comparing prices.
        def fetch_quote(ticker: str) -> tuple[str, ReferenceQuote | None]:
            try:
                quote = self._usable(
                    lambda: parse_nasdaq_etf_quote(self._get_json(
                        NASDAQ_ETF_INFO_URL.format(ticker=ticker),
                        params={"assetclass": "etf"},
                    ), ticker, expected_session=expected_session,
                        prefer_close=session_completed),
                    f"Nasdaq ETF live quote unavailable or wrong session for {ticker} "
                    f"(expected {expected_session})",
                )
                return ticker, quote
            except (requests.RequestException, ValueError, TypeError) as live_error:
                if not session_completed:
                    raise
                try:
                    quote = self._usable(
                        lambda: parse_nasdaq_etf_history(self._get_json(
                            NASDAQ_ETF_HISTORY_URL.format(ticker=ticker),
                            params={
                                "assetclass": "etf", "limit": "5",
                                "fromdate": expected_session.isoformat(),
                                # Nasdaq rejects equal from/to dates.
                                "todate": (expected_session + timedelta(days=1)).isoformat(),
                            },
                        ), ticker, expected_session),
                        f"Nasdaq ETF history has no close for {ticker} on {expected_session}",
                    )
                    return ticker, quote
                except (requests.RequestException, ValueError, TypeError) as history_error:
                    raise ValueError(
                        f"{_safe_error(live_error)}; {_safe_error(history_error)}"
                    ) from history_error

        with ThreadPoolExecutor(max_workers=min(4, len(tickers))) as executor:
            futures = {
                executor.submit(fetch_quote, ticker): ticker for ticker in tickers
            }
            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    resolved_ticker, quote = future.result()
                    if quote is not None:
                        quotes[resolved_ticker] = quote
                except (requests.RequestException, ValueError, TypeError) as exc:
                    errors.append(
                        f"Nasdaq ETF live quote failed for {ticker}: "
                        f"{_safe_error(exc)}"
                    )

        # Nasdaq exposes AUM (the comparable value stored for ETFs) on each
        # summary endpoint. Fetch the small tracked ETF set concurrently.
        def fetch_aum(ticker: str) -> tuple[str, float | None]:
            aum = self._usable(
                lambda: parse_nasdaq_etf_aum(self._get_json(
                    NASDAQ_ETF_SUMMARY_URL.format(ticker=ticker),
                    params={"assetclass": "etf"},
                )), f"Nasdaq ETF AUM unavailable for {ticker}",
            )
            return ticker, aum

        with ThreadPoolExecutor(max_workers=min(4, len(tickers))) as executor:
            futures = {executor.submit(fetch_aum, ticker): ticker for ticker in tickers}
            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    resolved_ticker, aum = future.result()
                    if resolved_ticker in quotes:
                        quotes[resolved_ticker] = replace(
                            quotes[resolved_ticker], market_cap=aum
                        )
                    elif aum is not None:
                        # An unavailable price must not discard a valid AUM
                        # comparison. The price error still makes this incomplete.
                        quotes[resolved_ticker] = ReferenceQuote(
                            ticker=resolved_ticker, source="Nasdaq ETF summary",
                            price=None, market_cap=aum, as_of=None,
                        )
                    if aum is None:
                        errors.append(f"Nasdaq ETF AUM unavailable for {ticker}")
                except (requests.RequestException, ValueError, TypeError) as exc:
                    errors.append(
                        f"Nasdaq ETF AUM failed for {ticker}: {_safe_error(exc)}"
                    )
        return quotes, errors


class CoinGeckoReferenceProvider:
    def __init__(
        self,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self.timeout = timeout
        self.session = session or create_http_session()

    def fetch(
        self, tickers: Sequence[str]
    ) -> tuple[dict[str, ReferenceQuote], list[str]]:
        if not tickers:
            return {}, []
        unsupported = sorted(ticker for ticker in tickers if ticker not in COINGECKO_IDS)
        supported = [ticker for ticker in tickers if ticker in COINGECKO_IDS]
        errors = [f"CoinGecko ID is not configured for {ticker}" for ticker in unsupported]
        if not supported:
            return {}, errors
        try:
            response = self.session.get(
                COINGECKO_SIMPLE_PRICE_URL,
                headers={"Accept": "application/json"},
                params={
                    "ids": ",".join(COINGECKO_IDS[ticker] for ticker in supported),
                    "vs_currencies": "usd",
                    "include_market_cap": "true",
                    "include_last_updated_at": "true",
                    "precision": "full",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, Mapping):
                raise ValueError("Unexpected CoinGecko response type")
            return parse_coingecko_payload(payload, supported), errors
        except (requests.RequestException, ValueError, TypeError) as exc:
            errors.append(f"CoinGecko reference failed: {_safe_error(exc)}")
            return {}, errors

    def fetch_history(self, ticker: str) -> Mapping[str, Any]:
        response = self.session.get(
            COINGECKO_CHART_URL.format(coin_id=COINGECKO_IDS[ticker]),
            headers={"Accept": "application/json"},
            params={"vs_currency": "usd", "days": "1", "precision": "full"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, Mapping):
            raise ValueError("Unexpected CoinGecko history response type")
        return payload


def nearest_crypto_observation(
    rows: Any, target: datetime, *, now: datetime,
) -> tuple[datetime, float] | None:
    """Choose by time, never by which price would make an audit pass."""
    if not isinstance(rows, list):
        return None
    observations: list[tuple[datetime, float]] = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) != 2:
            continue
        timestamp, value = parse_number(row[0]), parse_number(row[1])
        if timestamp is None or value is None or timestamp <= 0 or value <= 0:
            continue
        try:
            observed_at = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            continue
        if (
            observed_at <= now
            and abs((observed_at - target).total_seconds())
            <= CRYPTO_ALIGNMENT_MAX_SKEW_SECONDS
        ):
            observations.append((observed_at, value))
    if not observations:
        return None
    return min(
        observations,
        key=lambda item: (abs((item[0] - target).total_seconds()), item[0]),
    )


def align_crypto_references(
    assets: Sequence[StoredAsset],
    references: Mapping[str, ReferenceQuote],
    *,
    now: datetime,
    config: AuditConfig,
    provider: CoinGeckoReferenceProvider,
) -> tuple[dict[str, ReferenceQuote], list[str]]:
    """Recheck critical crypto differences against their observation times.

    Prices arrive every ten minutes, caps once a day. Comparing either snapshot
    to a later live quote can flag ordinary market movement as data corruption.
    Fetch history only for critical differences with a material time gap; keep
    the original critical result if no sufficiently close observation exists.
    """
    aligned = dict(references)
    errors: list[str] = []
    for asset in assets:
        quote = references.get(asset.ticker)
        if asset.asset_class != ASSET_CRYPTO or quote is None or quote.as_of is None:
            continue
        reference_age = _age_hours(now, quote.as_of)
        if not 0 <= reference_age <= config.crypto_reference_max_age_hours:
            continue
        fields = []
        for field, stored, live, observed_at, max_age, threshold, history_key in (
            ("price", asset.price, quote.price, asset.price_fetched_at,
             config.crypto_price_max_age_hours, config.price_critical_pct, "prices"),
            ("market_cap", asset.market_cap, quote.market_cap, asset.market_cap_updated_at,
             config.cap_max_age_hours, config.cap_critical_pct, "market_caps"),
        ):
            deviation = signed_deviation_pct(stored, live)
            if (
                deviation is not None and abs(deviation) >= threshold
                and stored is not None and stored > 0 and observed_at is not None
                and 0 <= _age_hours(now, observed_at) <= max_age
                and abs((quote.as_of - observed_at).total_seconds())
                > CRYPTO_ALIGNMENT_MAX_SKEW_SECONDS
            ):
                fields.append((field, observed_at, history_key, live))
        if not fields:
            continue
        try:
            history = provider.fetch_history(asset.ticker)
        except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
            errors.append(
                f"CoinGecko observation-time check failed for {asset.ticker}: "
                f"{_safe_error(exc)}"
            )
            continue
        notes: list[str] = []
        for field, observed_at, history_key, live in fields:
            observation = nearest_crypto_observation(
                history.get(history_key), observed_at, now=now,
            )
            if observation is None:
                errors.append(
                    f"CoinGecko {field} history has no observation within 5 minutes "
                    f"of {observed_at.isoformat()} for {asset.ticker}"
                )
                continue
            timestamp, value = observation
            quote = replace(quote, **{field: value, f"{field}_as_of": timestamp})
            notes.append(
                f"{field}: live reference {live:.8g} at {quote.as_of.isoformat()}; "
                f"comparing with {value:.8g} at {timestamp.isoformat()} "
                f"near stored observation {observed_at.isoformat()}"
            )
        if notes:
            aligned[asset.ticker] = replace(
                quote,
                source="CoinGecko (observation-time check)",
                alignment_notes=tuple(notes),
            )
    return aligned, errors


def _safe_error(error: BaseException) -> str:
    """Return a compact error without headers, response bodies, or API keys."""
    if isinstance(error, requests.HTTPError) and error.response is not None:
        return f"HTTP {error.response.status_code}"
    return str(error).splitlines()[0][:240]


def fetch_references(
    assets: Sequence[StoredAsset], *, timeout: float, now: datetime | None = None
) -> tuple[dict[str, ReferenceQuote], list[str]]:
    equities = [item.ticker for item in assets if item.asset_class == ASSET_EQUITY]
    etfs = [item.ticker for item in assets if item.asset_class == ASSET_ETF]
    crypto = [item.ticker for item in assets if item.asset_class == ASSET_CRYPTO]

    references: dict[str, ReferenceQuote] = {}
    errors: list[str] = []
    nasdaq = NasdaqReferenceProvider(timeout=timeout)
    stock_quotes, stock_errors = nasdaq.fetch_equities(equities)
    etf_quotes, etf_errors = nasdaq.fetch_etfs(etfs, now=now)
    crypto_quotes, crypto_errors = CoinGeckoReferenceProvider(
        timeout=timeout
    ).fetch(crypto)
    references.update(stock_quotes)
    references.update(etf_quotes)
    references.update(crypto_quotes)
    errors.extend(stock_errors)
    errors.extend(etf_errors)
    errors.extend(crypto_errors)
    return references, errors


def signed_deviation_pct(stored: float | None, reference: float | None) -> float | None:
    if stored is None or reference is None or reference <= 0:
        return None
    return ((stored - reference) / reference) * 100.0


def _age_hours(now: datetime, then: datetime) -> float:
    return (now - then).total_seconds() / 3600.0


def audit_assets(
    assets: Sequence[StoredAsset],
    references: Mapping[str, ReferenceQuote],
    *,
    now: datetime,
    config: AuditConfig | None = None,
    provider_errors: Sequence[str] = (),
) -> AuditReport:
    config = config or AuditConfig()
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)
    findings: list[Finding] = []
    comparisons: list[AssetComparison] = []
    incomplete = bool(provider_errors)

    for asset in sorted(assets, key=lambda item: item.ticker):
        reference = references.get(asset.ticker)
        reference_usable = reference is not None

        if reference is not None:
            for field, target in (
                ("price", asset.price_fetched_at),
                ("market_cap", asset.market_cap_updated_at),
            ):
                observed_at = getattr(reference, f"{field}_as_of")
                if observed_at is not None and (
                    asset.asset_class != ASSET_CRYPTO or target is None
                    or observed_at > now
                    or abs((observed_at - target).total_seconds())
                    > CRYPTO_ALIGNMENT_MAX_SKEW_SECONDS
                ):
                    reference = replace(reference, **{field: None})
                    findings.append(Finding(
                        "warning", "reference_time_mismatch", asset.ticker, field,
                        "Historical reference is not within 5 minutes of the stored observation",
                    ))
                    incomplete = True
            for note in reference.alignment_notes:
                findings.append(Finding(
                    "warning", "reference_time_aligned", asset.ticker, "all", note,
                ))

        if asset.price is None or asset.price <= 0:
            findings.append(
                Finding(
                    "critical",
                    "stored_price_missing",
                    asset.ticker,
                    "price",
                    "Stored price is missing or non-positive",
                    stored_value=asset.price,
                )
            )
        if asset.price_fetched_at is None:
            findings.append(
                Finding(
                    "critical",
                    "stored_price_timestamp_missing",
                    asset.ticker,
                    "price",
                    "Stored price has no fetched_at timestamp",
                    stored_value=asset.price,
                )
            )
        else:
            price_age = _age_hours(now, asset.price_fetched_at)
            price_max_age = (
                config.crypto_price_max_age_hours
                if asset.asset_class == ASSET_CRYPTO
                else config.equity_price_max_age_hours
            )
            if price_age < -0.25:
                findings.append(
                    Finding(
                        "critical",
                        "stored_price_timestamp_in_future",
                        asset.ticker,
                        "price",
                        f"Stored fetched_at is {-price_age:.1f}h in the future",
                        stored_value=asset.price,
                    )
                )
            elif price_age > price_max_age:
                findings.append(
                    Finding(
                        "critical",
                        "stored_price_stale",
                        asset.ticker,
                        "price",
                        f"Stored price is {price_age:.1f}h old (limit {price_max_age:.1f}h)",
                        stored_value=asset.price,
                    )
                )

        if asset.market_cap is None or asset.market_cap <= 0:
            findings.append(
                Finding(
                    "critical",
                    "stored_market_cap_missing",
                    asset.ticker,
                    "market_cap",
                    "Stored market cap/AUM is missing or non-positive",
                    stored_value=asset.market_cap,
                )
            )
        if asset.market_cap_updated_at is not None:
            cap_timestamp = asset.market_cap_updated_at
        elif asset.market_cap_as_of is not None:
            cap_timestamp = datetime.combine(
                asset.market_cap_as_of, time.min, tzinfo=timezone.utc
            )
        else:
            cap_timestamp = None

        if cap_timestamp is None:
            findings.append(
                Finding(
                    "critical",
                    "market_cap_timestamp_missing",
                    asset.ticker,
                    "market_cap",
                    "No market-cap observation timestamp establishes freshness",
                    stored_value=asset.market_cap,
                )
            )
        else:
            cap_age = _age_hours(now, cap_timestamp)
            if cap_age < -0.25:
                findings.append(
                    Finding(
                        "critical",
                        "market_cap_timestamp_in_future",
                        asset.ticker,
                        "market_cap",
                        "Market-cap observation timestamp is in the future",
                        stored_value=asset.market_cap,
                    )
                )
            elif cap_age > config.cap_max_age_hours:
                findings.append(
                    Finding(
                        "critical",
                        "stored_market_cap_stale",
                        asset.ticker,
                        "market_cap",
                        f"Market-cap observation is {cap_age:.1f}h old "
                        f"(limit {config.cap_max_age_hours:.1f}h)",
                        stored_value=asset.market_cap,
                    )
                )

        expected_metric = {
            ASSET_EQUITY: "equity_market_cap",
            ASSET_ETF: "aum",
            ASSET_CRYPTO: "circulating_market_cap",
        }[asset.asset_class]
        if not asset.market_cap_source:
            findings.append(
                Finding(
                    "critical",
                    "market_cap_source_missing",
                    asset.ticker,
                    "market_cap",
                    "Stored market value has no provider provenance",
                    stored_value=asset.market_cap,
                )
            )
        if asset.market_cap_metric != expected_metric:
            findings.append(
                Finding(
                    "critical",
                    "market_cap_metric_mismatch",
                    asset.ticker,
                    "market_cap",
                    (
                        f"Stored metric is {asset.market_cap_metric or 'missing'}; "
                        f"expected {expected_metric}"
                    ),
                    stored_value=asset.market_cap,
                )
            )

        if reference is None:
            findings.append(
                Finding(
                    "warning",
                    "reference_missing",
                    asset.ticker,
                    "all",
                    "External reference returned no quote",
                )
            )
            incomplete = True
        elif reference.as_of is None and asset.asset_class == ASSET_CRYPTO:
            findings.append(Finding(
                "warning", "reference_timestamp_missing", asset.ticker, "all",
                "Crypto reference has no observation timestamp; comparison skipped",
            ))
            reference_usable = False
            incomplete = True
        elif reference.as_of is not None:
            reference_age = _age_hours(now, reference.as_of)
            max_reference_age = (
                config.crypto_reference_max_age_hours
                if asset.asset_class == ASSET_CRYPTO
                else config.reference_max_age_hours
            )
            if reference_age < -0.25 or reference_age > max_reference_age:
                findings.append(
                    Finding(
                        "warning",
                        "reference_stale",
                        asset.ticker,
                        "all",
                        f"{reference.source} reference age is {reference_age:.1f}h; "
                        "comparison skipped",
                    )
                )
                reference_usable = False
                incomplete = True

        price_deviation = signed_deviation_pct(
            asset.price, reference.price if reference_usable and reference else None
        )
        cap_deviation = signed_deviation_pct(
            asset.market_cap,
            reference.market_cap if reference_usable and reference else None,
        )

        if reference_usable and reference is not None:
            if reference.price is None or reference.price <= 0:
                findings.append(
                    Finding(
                        "warning",
                        "reference_price_missing",
                        asset.ticker,
                        "price",
                        f"{reference.source} returned no usable price",
                    )
                )
                incomplete = True
            elif price_deviation is not None:
                _append_deviation_finding(
                    findings,
                    ticker=asset.ticker,
                    field="price",
                    deviation=price_deviation,
                    warning_threshold=config.price_warning_pct,
                    critical_threshold=config.price_critical_pct,
                    stored=asset.price,
                    reference=reference.price,
                    source=reference.source,
                )

            if reference.market_cap is None or reference.market_cap <= 0:
                findings.append(
                    Finding(
                        "warning",
                        "reference_market_cap_missing",
                        asset.ticker,
                        "market_cap",
                        f"{reference.source} returned no usable market cap/AUM",
                    )
                )
                incomplete = True
            elif cap_deviation is not None:
                _append_deviation_finding(
                    findings,
                    ticker=asset.ticker,
                    field="market_cap",
                    deviation=cap_deviation,
                    warning_threshold=config.cap_warning_pct,
                    critical_threshold=config.cap_critical_pct,
                    stored=asset.market_cap,
                    reference=reference.market_cap,
                    source=reference.source,
                )

        comparisons.append(
            AssetComparison(
                ticker=asset.ticker,
                asset_class=asset.asset_class,
                source=reference.source if reference else None,
                stored_price=asset.price,
                reference_price=reference.price if reference else None,
                price_deviation_pct=price_deviation,
                stored_market_cap=asset.market_cap,
                reference_market_cap=reference.market_cap if reference else None,
                market_cap_deviation_pct=cap_deviation,
                price_fetched_at=asset.price_fetched_at,
                market_cap_as_of=asset.market_cap_as_of,
                reference_as_of=reference.as_of if reference else None,
                price_reference_as_of=(
                    reference.price_as_of or reference.as_of
                ) if reference else None,
                market_cap_reference_as_of=(
                    reference.market_cap_as_of or reference.as_of
                ) if reference else None,
            )
        )

    findings.sort(
        key=lambda item: (
            {"critical": 0, "warning": 1}.get(item.severity, 2),
            item.ticker,
            item.code,
        )
    )
    return AuditReport(
        generated_at=now,
        comparisons=comparisons,
        findings=findings,
        provider_errors=list(provider_errors),
        incomplete=incomplete,
    )


def _append_deviation_finding(
    findings: list[Finding],
    *,
    ticker: str,
    field: str,
    deviation: float,
    warning_threshold: float,
    critical_threshold: float,
    stored: float | None,
    reference: float | None,
    source: str,
) -> None:
    absolute_deviation = abs(deviation)
    if absolute_deviation < warning_threshold:
        return
    severity = "critical" if absolute_deviation >= critical_threshold else "warning"
    label = "price" if field == "price" else "market cap/AUM"
    findings.append(
        Finding(
            severity=severity,
            code=f"{field}_deviation",
            ticker=ticker,
            field=field,
            message=(
                f"Stored {label} is {deviation:+.2f}% versus {source} "
                f"(threshold {critical_threshold:.2f}% critical)"
            ),
            stored_value=stored,
            reference_value=reference,
            deviation_pct=deviation,
        )
    )


def _format_value(value: float | None, field: str) -> str:
    if value is None:
        return "missing"
    if field == "market_cap":
        for suffix, divisor in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
            if abs(value) >= divisor:
                return f"${value / divisor:,.2f}{suffix}"
        return f"${value:,.0f}"
    if abs(value) < 1:
        return f"${value:,.8f}".rstrip("0").rstrip(".")
    return f"${value:,.2f}"


def render_human(report: AuditReport, *, verbose: bool = False) -> str:
    total = len(report.comparisons)
    price_coverage = sum(item.reference_price is not None for item in report.comparisons)
    cap_coverage = sum(
        item.reference_market_cap is not None for item in report.comparisons
    )
    lines = [
        f"Market data audit: {report.status} (exit {report.exit_code})",
        f"Assets: {total} | critical: {report.critical_count} | "
        f"warnings: {report.warning_count}",
        f"Reference coverage: price {price_coverage}/{total} | "
        f"market cap/AUM {cap_coverage}/{total}",
        f"Generated: {report.generated_at.isoformat()}",
    ]
    if report.provider_errors:
        lines.append("Provider errors:")
        lines.extend(f"  - {error}" for error in report.provider_errors)
    if report.findings:
        lines.append("Findings:")
        for finding in report.findings:
            values = ""
            if finding.stored_value is not None or finding.reference_value is not None:
                values = (
                    f" [stored={_format_value(finding.stored_value, finding.field)}, "
                    f"reference={_format_value(finding.reference_value, finding.field)}]"
                )
            lines.append(
                f"  {finding.severity.upper():8} {finding.ticker:9} "
                f"{finding.code}: {finding.message}{values}"
            )
    else:
        lines.append("No deviations, missing values, or stale values were found.")

    if verbose:
        lines.append("All comparisons:")
        for item in report.comparisons:
            price_delta = (
                f"{item.price_deviation_pct:+.2f}%"
                if item.price_deviation_pct is not None
                else "n/a"
            )
            cap_delta = (
                f"{item.market_cap_deviation_pct:+.2f}%"
                if item.market_cap_deviation_pct is not None
                else "n/a"
            )
            lines.append(
                f"  {item.ticker:9} price "
                f"{_format_value(item.stored_price, 'price')} / "
                f"{_format_value(item.reference_price, 'price')} ({price_delta}); "
                f"cap {_format_value(item.stored_market_cap, 'market_cap')} / "
                f"{_format_value(item.reference_market_cap, 'market_cap')} "
                f"({cap_delta}); source={item.source or 'missing'}"
            )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only audit of active DB market data.",
        epilog="Exit codes: 0 pass, 1 critical data finding, 2 incomplete audit.",
    )
    parser.add_argument(
        "--asset-class",
        choices=("all",) + ASSET_CLASSES,
        default="all",
        help="limit the audit to one asset class",
    )
    parser.add_argument(
        "--ticker",
        action="append",
        default=[],
        help="audit one active ticker; repeat for multiple tickers",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--verbose", action="store_true", help="show passing comparisons too"
    )
    parser.add_argument(
        "--no-log",
        action="store_true",
        help="do not append the operational audit result to fetch_logs",
    )
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--price-warning-pct", type=float, default=DEFAULT_PRICE_WARNING_PCT
    )
    parser.add_argument(
        "--price-critical-pct", type=float, default=DEFAULT_PRICE_CRITICAL_PCT
    )
    parser.add_argument("--cap-warning-pct", type=float, default=DEFAULT_CAP_WARNING_PCT)
    parser.add_argument("--cap-critical-pct", type=float, default=DEFAULT_CAP_CRITICAL_PCT)
    parser.add_argument(
        "--equity-price-max-age-hours",
        type=float,
        default=DEFAULT_EQUITY_PRICE_MAX_AGE_HOURS,
    )
    parser.add_argument(
        "--crypto-price-max-age-hours",
        type=float,
        default=DEFAULT_CRYPTO_PRICE_MAX_AGE_HOURS,
    )
    parser.add_argument(
        "--cap-max-age-hours", type=float, default=DEFAULT_CAP_MAX_AGE_HOURS
    )
    return parser


def _validate_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    numeric_values = {
        "timeout": args.timeout,
        "price warning": args.price_warning_pct,
        "price critical": args.price_critical_pct,
        "cap warning": args.cap_warning_pct,
        "cap critical": args.cap_critical_pct,
        "equity max age": args.equity_price_max_age_hours,
        "crypto max age": args.crypto_price_max_age_hours,
        "cap max age": args.cap_max_age_hours,
    }
    if any(value <= 0 for value in numeric_values.values()):
        parser.error("timeouts, thresholds, and max ages must be positive")
    if args.price_critical_pct < args.price_warning_pct:
        parser.error("price critical threshold must be >= warning threshold")
    if args.cap_critical_pct < args.cap_warning_pct:
        parser.error("cap critical threshold must be >= warning threshold")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _validate_args(parser, args)

    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv(repo_root / ".env.local")
    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    # Reads may use the public key; the optional audit-log append is strictly
    # server-side and therefore uses the service-role key separately.
    supabase_read_key = (
        os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or service_role_key
    )
    if not supabase_url or not supabase_read_key:
        print(
            "Market data audit configuration is incomplete: set the Supabase "
            "URL and an anon/service key.",
            file=sys.stderr,
        )
        return EXIT_INCOMPLETE

    now = datetime.now(timezone.utc)
    config = AuditConfig(
        price_warning_pct=args.price_warning_pct,
        price_critical_pct=args.price_critical_pct,
        cap_warning_pct=args.cap_warning_pct,
        cap_critical_pct=args.cap_critical_pct,
        equity_price_max_age_hours=args.equity_price_max_age_hours,
        crypto_price_max_age_hours=args.crypto_price_max_age_hours,
        cap_max_age_hours=args.cap_max_age_hours,
    )
    lookback_days = max(30, math.ceil(args.cap_max_age_hours / 24) + 7)
    try:
        assets = SupabaseReader(
            supabase_url, supabase_read_key, timeout=args.timeout
        ).fetch_assets(now=now, cap_lookback_days=lookback_days)
    except (requests.RequestException, ValueError, TypeError) as exc:
        print(f"Supabase read failed: {_safe_error(exc)}", file=sys.stderr)
        return EXIT_INCOMPLETE

    requested = {ticker.upper() for ticker in args.ticker}
    if requested:
        active = {asset.ticker for asset in assets}
        missing = sorted(requested - active)
        if missing:
            print(
                "Requested ticker(s) are not active in the DB: " + ", ".join(missing),
                file=sys.stderr,
            )
            return EXIT_INCOMPLETE
        assets = [asset for asset in assets if asset.ticker in requested]
    if args.asset_class != "all":
        assets = [asset for asset in assets if asset.asset_class == args.asset_class]
    if not assets:
        print("No active assets matched the requested filters.", file=sys.stderr)
        return EXIT_INCOMPLETE

    references, provider_errors = fetch_references(
        assets, timeout=args.timeout, now=now
    )
    # Provider reads can take seconds; freshness is evaluated after those reads.
    now = datetime.now(timezone.utc)
    references, alignment_errors = align_crypto_references(
        assets, references, now=now, config=config,
        provider=CoinGeckoReferenceProvider(timeout=args.timeout),
    )
    provider_errors.extend(alignment_errors)
    report = audit_assets(
        assets,
        references,
        now=now,
        config=config,
        provider_errors=provider_errors,
    )
    if args.json:
        print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    else:
        print(render_human(report, verbose=args.verbose))

    log_failed = False
    full_audit = not args.ticker and args.asset_class == "all"
    if not args.no_log and full_audit:
        if service_role_key:
            try:
                SupabaseAuditLogWriter(
                    supabase_url,
                    service_role_key,
                    timeout=args.timeout,
                ).record(report)
            except (requests.RequestException, ValueError, TypeError) as exc:
                log_failed = True
                print(
                    f"Audit result log write failed: {_safe_error(exc)}",
                    file=sys.stderr,
                )
        else:
            print(
                "Audit result was not logged: SUPABASE_SERVICE_ROLE_KEY is not set. "
                "Use --no-log for an intentional local read-only run.",
                file=sys.stderr,
            )
    elif not args.no_log:
        print(
            "Scoped audit result was not logged and will not change the "
            "persistent-failure streak.",
            file=sys.stderr,
        )

    if log_failed and report.exit_code == EXIT_OK:
        return EXIT_INCOMPLETE
    return report.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
