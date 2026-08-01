"""Refresh market-cap-like values for tracked equities, ETFs, and crypto.

The ``stocks.market_cap`` column has three deliberately distinct semantics:

* equities: company equity market capitalization
* ETFs: assets under management (AUM)
* crypto: circulating market capitalization

Provider failures never fall back to a hand-maintained value.  The existing
database value is left untouched instead.

Examples:
    python scripts/update_market_caps.py
    python scripts/update_market_caps.py MU BTC-USD --dry-run
    python scripts/update_market_caps.py --ticker MU --ticker QQQ
    python scripts/update_market_caps.py --asset-class crypto
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Sequence

import requests
import yfinance as yf
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import create_client
from urllib3.util.retry import Retry


SCRIPT_DIR = os.path.dirname(__file__)
sys.path.insert(0, SCRIPT_DIR)

from tickers import (  # noqa: E402
    ALL_EQUITY_TICKERS,
    ALL_TICKERS,
    CRYPTO_TICKERS,
    ETF_TICKERS,
    to_yf,
)


load_dotenv(dotenv_path=os.path.join(SCRIPT_DIR, "..", ".env.local"))
load_dotenv()

ASSET_EQUITY = "equity"
ASSET_ETF = "etf"
ASSET_CRYPTO = "crypto"

ASSET_SEMANTICS = {
    ASSET_EQUITY: "equity_market_cap",
    ASSET_ETF: "aum",
    ASSET_CRYPTO: "circulating_market_cap",
}

UNEXPLAINED_MOVE_LIMIT = {
    ASSET_EQUITY: 0.35,
    ASSET_ETF: 0.35,
    # Large-cap crypto can legitimately move more than 60% between daily cap
    # observations. The fresh CoinGecko-only policy is the primary guard.
    ASSET_CRYPTO: 2.00,
}
FORMULA_TOLERANCE = {
    ASSET_EQUITY: 0.15,
    ASSET_ETF: 0.30,
    ASSET_CRYPTO: 0.10,
}
EQUITY_CROSS_CHECK_TOLERANCE = 0.15

DEFAULT_SLEEP_SECONDS = 0.3
DB_WRITE_ATTEMPTS = 2
DB_WRITE_RETRY_DELAY_SECONDS = 0.5
FALLBACK_POLICY = "manual_fallbacks_disabled_preserve_last_known_good"
HTTP_TIMEOUT_SECONDS = 30
CRYPTO_REFERENCE_MAX_AGE_SECONDS = 15 * 60
PROVIDER_FUTURE_SKEW_SECONDS = 5 * 60

NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks"
NASDAQ_ETF_SUMMARY_URL = "https://api.nasdaq.com/api/quote/{ticker}/summary"
COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price"
NASDAQ_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
    "User-Agent": "Mozilla/5.0 (compatible; BHSLMarketData/1.0)",
}

CRYPTO_COINGECKO_IDS = {
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

_EQUITY_SET = frozenset(t.upper() for t in ALL_EQUITY_TICKERS)
_ETF_SET = frozenset(t.upper() for t in ETF_TICKERS)
_CRYPTO_SET = frozenset(t.upper() for t in CRYPTO_TICKERS)
_ALL_SET = frozenset(t.upper() for t in ALL_TICKERS)

# Kept as a module-level name for compatibility with scripts/tests that patch it.
# It is initialized lazily so ``--help`` and unit tests do not require secrets.
supabase = None


class MarketCapProviderError(RuntimeError):
    """Raised when the provider cannot supply a semantically valid value."""


class MarketCapStateError(RuntimeError):
    """Raised when last-known-good state cannot be loaded safely."""


@dataclass(frozen=True)
class MarketCapObservation:
    ticker: str
    asset_class: str
    semantic: str
    market_cap: int
    source: str
    price: float | None = None
    quantity: float | None = None
    quantity_name: str | None = None
    cross_check_market_cap: int | None = None
    cross_check_source: str | None = None
    provider_note: str | None = None


@dataclass(frozen=True)
class PreviousMarketData:
    market_cap: int | None
    price: float | None


@dataclass(frozen=True)
class ValidationResult:
    accepted: bool
    reason: str
    change_pct: float | None = None
    expected_market_cap: int | None = None


@dataclass(frozen=True)
class TickerOutcome:
    ticker: str
    asset_class: str
    semantic: str
    status: str
    reason: str
    source: str | None = None
    previous_market_cap: int | None = None
    candidate_market_cap: int | None = None
    fallback_action: str = "not_needed"
    cross_check_market_cap: int | None = None
    cross_check_source: str | None = None
    provider_note: str | None = None


@dataclass
class RunSummary:
    outcomes: list[TickerOutcome] = field(default_factory=list)

    @property
    def updated(self) -> int:
        return sum(outcome.status == "updated" for outcome in self.outcomes)

    @property
    def would_update(self) -> int:
        return sum(outcome.status == "would_update" for outcome in self.outcomes)

    @property
    def failed(self) -> int:
        return sum(outcome.status == "failed" for outcome in self.outcomes)

    @property
    def failed_tickers(self) -> list[str]:
        return [
            outcome.ticker
            for outcome in self.outcomes
            if outcome.status == "failed"
        ]


def get_supabase_client():
    """Create the service-role client only when a DB operation is requested."""
    global supabase
    if supabase is not None:
        return supabase

    url = os.environ.get("SUPABASE_URL") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and "
            "SUPABASE_SERVICE_ROLE_KEY are required"
        )
    supabase = create_client(url, key)
    return supabase


def asset_class_for_ticker(ticker: str) -> str:
    normalized = ticker.upper()
    if normalized in _EQUITY_SET:
        return ASSET_EQUITY
    if normalized in _ETF_SET:
        return ASSET_ETF
    if normalized in _CRYPTO_SET:
        return ASSET_CRYPTO
    raise ValueError(f"Unknown tracked ticker: {ticker}")


def _positive_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _first_positive(*values: Any) -> float | None:
    for value in values:
        number = _positive_number(value)
        if number is not None:
            return number
    return None


def _provider_number(value: Any) -> float | None:
    """Parse provider numbers that may contain currency/percent formatting."""
    if isinstance(value, str):
        cleaned = value.strip().replace("$", "").replace(",", "")
        cleaned = cleaned.removesuffix("%")
        if cleaned.lower() in {"", "n/a", "na", "none", "null", "--"}:
            return None
        value = cleaned
    return _positive_number(value)


def _nasdaq_etf_aum(payload: Mapping[str, Any]) -> float | None:
    """Parse Nasdaq's ETF share-class AUM, whose label may be in thousands."""
    data = payload.get("data") or {}
    summary = data.get("summaryData") if isinstance(data, Mapping) else None
    aum = summary.get("AUM") if isinstance(summary, Mapping) else None
    if not isinstance(aum, Mapping):
        return None
    value = _provider_number(aum.get("value"))
    if value is None:
        return None
    label = str(aum.get("label") or "").lower()
    return value * 1_000 if "000" in label else value


def observation_from_provider_data(
    ticker: str,
    info: Mapping[str, Any] | None,
    fast_info: Mapping[str, Any] | None = None,
) -> MarketCapObservation:
    """Normalize yfinance fields without mixing asset-class semantics."""
    normalized = ticker.upper()
    asset_class = asset_class_for_ticker(normalized)
    info = info or {}
    fast_info = fast_info or {}

    if asset_class == ASSET_EQUITY:
        price = _first_positive(
            info.get("currentPrice"),
            info.get("regularMarketPrice"),
            fast_info.get("last_price"),
            fast_info.get("regular_market_price"),
        )
        quantity = _first_positive(
            info.get("impliedSharesOutstanding"),
            info.get("sharesOutstanding"),
        )
        market_cap = _positive_number(info.get("marketCap"))
        source = "yfinance.info.marketCap"
        if market_cap is None:
            market_cap = _positive_number(fast_info.get("market_cap"))
            source = "yfinance.fast_info.market_cap"
        if market_cap is None and price is not None and quantity is not None:
            market_cap = price * quantity
            source = "derived.price_x_shares_outstanding"
        quantity_name = "shares_outstanding" if quantity is not None else None

    elif asset_class == ASSET_ETF:
        # For a fund, marketCap is ambiguous.  Store AUM only, preferring the
        # provider's explicit total/net-assets fields and deriving from NAV as a
        # final provider-backed option.
        price = _first_positive(
            info.get("navPrice"),
            info.get("currentPrice"),
            info.get("regularMarketPrice"),
        )
        quantity = _first_positive(info.get("sharesOutstanding"))
        market_cap = _positive_number(info.get("totalAssets"))
        source = "yfinance.info.totalAssets"
        if market_cap is None:
            market_cap = _positive_number(info.get("netAssets"))
            source = "yfinance.info.netAssets"
        if market_cap is None and price is not None and quantity is not None:
            market_cap = price * quantity
            source = "derived.nav_x_etf_shares"
        quantity_name = "etf_shares" if quantity is not None else None

    else:
        price = _first_positive(
            info.get("regularMarketPrice"),
            info.get("currentPrice"),
            fast_info.get("last_price"),
            fast_info.get("regular_market_price"),
        )
        quantity = _first_positive(info.get("circulatingSupply"))
        market_cap = _positive_number(info.get("marketCap"))
        source = "yfinance.info.marketCap"
        if market_cap is None:
            market_cap = _positive_number(fast_info.get("market_cap"))
            source = "yfinance.fast_info.market_cap"
        if market_cap is None and price is not None and quantity is not None:
            market_cap = price * quantity
            source = "derived.price_x_circulating_supply"
        quantity_name = (
            "circulating_supply" if quantity is not None else None
        )

    if market_cap is None:
        raise MarketCapProviderError(
            f"no provider-backed {ASSET_SEMANTICS[asset_class]} value"
        )

    return MarketCapObservation(
        ticker=normalized,
        asset_class=asset_class,
        semantic=ASSET_SEMANTICS[asset_class],
        market_cap=int(round(market_cap)),
        source=source,
        price=price,
        quantity=quantity,
        quantity_name=quantity_name,
    )


def _mapping_from_fast_info(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return dict(value)
    try:
        return dict(value)
    except (TypeError, ValueError):
        return {}


def fetch_yfinance_observation(ticker: str) -> MarketCapObservation:
    """Fetch a secondary/cross-check observation from yfinance."""
    normalized = ticker.upper()
    instrument = yf.Ticker(to_yf(normalized))
    info: Mapping[str, Any] = {}
    info_error: Exception | None = None

    try:
        raw_info = instrument.info
        info = raw_info if isinstance(raw_info, Mapping) else {}
    except Exception as exc:  # provider/network failures are per-ticker failures
        info_error = exc

    try:
        return observation_from_provider_data(normalized, info)
    except MarketCapProviderError as primary_error:
        # fast_info is another yfinance provider endpoint, not a manual fallback.
        # Its generic market_cap field is intentionally not used for ETFs,
        # because the field does not clearly promise AUM semantics.
        if asset_class_for_ticker(normalized) != ASSET_ETF:
            try:
                fast_info = _mapping_from_fast_info(instrument.fast_info)
                return observation_from_provider_data(
                    normalized, info, fast_info=fast_info
                )
            except Exception as fast_error:
                detail = f"info={info_error or primary_error}; fast_info={fast_error}"
                raise MarketCapProviderError(detail) from fast_error

        detail = str(info_error or primary_error)
        raise MarketCapProviderError(detail) from info_error


def _build_http_session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        status_forcelist=[429, 500, 502, 503, 504, 520],
        allowed_methods=["GET", "HEAD"],
        backoff_factor=1,
        respect_retry_after_header=True,
    )
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _nasdaq_symbol_to_ticker(symbol: str) -> str:
    normalized = symbol.strip().upper()
    aliases = {
        "BRK/B": "BRK.B",
        "BRK-B": "BRK.B",
        "BF/B": "BF.B",
        "BF-B": "BF.B",
    }
    return aliases.get(normalized, normalized)


class MarketDataProvider:
    """Asset-aware provider router with one bulk request per primary source."""

    def __init__(self, session: requests.Session | None = None):
        self.session = session or _build_http_session()
        self._nasdaq_rows: dict[str, Mapping[str, Any]] | None = None
        self._nasdaq_error: str | None = None
        self._coingecko_rows: dict[str, Mapping[str, Any]] | None = None
        self._coingecko_error: str | None = None
        self._etf_aum: dict[str, float] = {}
        self._etf_errors: dict[str, str] = {}

    def _load_nasdaq_rows(self) -> dict[str, Mapping[str, Any]]:
        if self._nasdaq_rows is not None:
            return self._nasdaq_rows
        try:
            response = self.session.get(
                NASDAQ_SCREENER_URL,
                params={
                    "tableonly": "true",
                    "limit": "10000",
                    "offset": "0",
                    "download": "true",
                },
                headers=NASDAQ_HEADERS,
                timeout=HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
            rows = ((payload.get("data") or {}).get("rows") or [])
            if not isinstance(rows, list):
                raise ValueError("Nasdaq response data.rows is not a list")
            self._nasdaq_rows = {
                _nasdaq_symbol_to_ticker(str(row.get("symbol", ""))): row
                for row in rows
                if isinstance(row, Mapping) and row.get("symbol")
            }
        except Exception as exc:
            self._nasdaq_error = str(exc)
            self._nasdaq_rows = {}
        return self._nasdaq_rows

    def _load_coingecko_rows(self) -> dict[str, Mapping[str, Any]]:
        if self._coingecko_rows is not None:
            return self._coingecko_rows
        try:
            coin_ids = sorted(set(CRYPTO_COINGECKO_IDS.values()))
            response = self.session.get(
                COINGECKO_SIMPLE_PRICE_URL,
                params={
                    "ids": ",".join(coin_ids),
                    "vs_currencies": "usd",
                    "include_market_cap": "true",
                    "include_last_updated_at": "true",
                },
                headers={"Accept": "application/json"},
                timeout=HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, Mapping):
                raise ValueError("CoinGecko response is not an object")
            self._coingecko_rows = {
                str(coin_id): row
                for coin_id, row in payload.items()
                if isinstance(row, Mapping)
            }
        except Exception as exc:
            self._coingecko_error = str(exc)
            self._coingecko_rows = {}
        return self._coingecko_rows

    @staticmethod
    def _try_yfinance(ticker: str) -> tuple[MarketCapObservation | None, str | None]:
        try:
            return fetch_yfinance_observation(ticker), None
        except Exception as exc:
            return None, str(exc)

    def _fetch_equity(self, ticker: str) -> MarketCapObservation:
        row = self._load_nasdaq_rows().get(ticker)
        yfinance_observation, yfinance_error = self._try_yfinance(ticker)
        if row is not None:
            market_cap = _provider_number(row.get("marketCap"))
            if market_cap is not None:
                nasdaq_price = _provider_number(
                    row.get("lastsale") or row.get("lastSale")
                )
                return MarketCapObservation(
                    ticker=ticker,
                    asset_class=ASSET_EQUITY,
                    semantic=ASSET_SEMANTICS[ASSET_EQUITY],
                    market_cap=int(round(market_cap)),
                    source="nasdaq.screener.marketCap",
                    price=(
                        yfinance_observation.price
                        if yfinance_observation and yfinance_observation.price
                        else nasdaq_price
                    ),
                    quantity=(
                        yfinance_observation.quantity
                        if yfinance_observation
                        else None
                    ),
                    quantity_name=(
                        yfinance_observation.quantity_name
                        if yfinance_observation
                        else None
                    ),
                    cross_check_market_cap=(
                        yfinance_observation.market_cap
                        if yfinance_observation
                        else None
                    ),
                    cross_check_source=(
                        yfinance_observation.source
                        if yfinance_observation
                        else None
                    ),
                    provider_note=(
                        f"yfinance cross-check unavailable: {yfinance_error}"
                        if yfinance_error
                        else None
                    ),
                )

        if yfinance_observation is not None:
            reason = self._nasdaq_error or "ticker/value absent from Nasdaq screener"
            return replace(
                yfinance_observation,
                source=f"{yfinance_observation.source}.secondary",
                provider_note=f"Nasdaq primary unavailable: {reason}",
            )
        raise MarketCapProviderError(
            "Nasdaq primary and yfinance secondary unavailable: "
            f"nasdaq={self._nasdaq_error or 'ticker/value absent'}; "
            f"yfinance={yfinance_error or 'no value'}"
        )

    def _fetch_crypto(self, ticker: str) -> MarketCapObservation:
        coin_id = CRYPTO_COINGECKO_IDS.get(ticker)
        if not coin_id:
            raise MarketCapProviderError(f"no CoinGecko id mapped for {ticker}")
        row = self._load_coingecko_rows().get(coin_id)
        if row is not None:
            market_cap = _provider_number(row.get("usd_market_cap"))
            price = _provider_number(row.get("usd"))
            if market_cap is not None and price is not None:
                updated_epoch = _positive_number(row.get("last_updated_at"))
                if updated_epoch is None:
                    raise MarketCapProviderError(
                        "CoinGecko response has no valid last_updated_at"
                    )
                reference_age = time.time() - updated_epoch
                if reference_age < -PROVIDER_FUTURE_SKEW_SECONDS:
                    raise MarketCapProviderError(
                        "CoinGecko last_updated_at is in the future"
                    )
                if reference_age > CRYPTO_REFERENCE_MAX_AGE_SECONDS:
                    raise MarketCapProviderError(
                        f"CoinGecko response is stale ({reference_age:.0f}s old)"
                    )
                # Yahoo's crypto market-cap field has returned inconsistent
                # implied supplies (the original DOGE regression). It is useful
                # only as a logged cross-check, never as a write fallback.
                yfinance_observation, yfinance_error = self._try_yfinance(ticker)
                note = f"CoinGecko last_updated_at={int(updated_epoch)}"
                if yfinance_error:
                    note = (
                        f"{note}; " if note else ""
                    ) + f"yfinance cross-check unavailable: {yfinance_error}"
                return MarketCapObservation(
                    ticker=ticker,
                    asset_class=ASSET_CRYPTO,
                    semantic=ASSET_SEMANTICS[ASSET_CRYPTO],
                    market_cap=int(round(market_cap)),
                    source="coingecko.simple.usd_market_cap",
                    price=price,
                    # Do not mix Yahoo's occasionally stale circulating supply
                    # into validation of CoinGecko's primary market cap.
                    cross_check_market_cap=(
                        yfinance_observation.market_cap
                        if yfinance_observation
                        else None
                    ),
                    cross_check_source=(
                        yfinance_observation.source
                        if yfinance_observation
                        else None
                    ),
                    provider_note=note,
                )

        reason = self._coingecko_error or "coin/value absent from response"
        raise MarketCapProviderError(
            "CoinGecko circulating market cap unavailable; preserving "
            f"last-known-good value: {reason}"
        )

    def _fetch_etf(self, ticker: str) -> MarketCapObservation:
        if ticker not in self._etf_aum and ticker not in self._etf_errors:
            try:
                response = self.session.get(
                    NASDAQ_ETF_SUMMARY_URL.format(ticker=ticker),
                    params={"assetclass": "etf"},
                    headers=NASDAQ_HEADERS,
                    timeout=HTTP_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, Mapping):
                    raise ValueError("Nasdaq ETF summary is not an object")
                aum = _nasdaq_etf_aum(payload)
                if aum is None:
                    raise ValueError("Nasdaq ETF summary has no usable AUM")
                self._etf_aum[ticker] = aum
            except Exception as exc:
                self._etf_errors[ticker] = str(exc)

        aum = self._etf_aum.get(ticker)
        if aum is None:
            raise MarketCapProviderError(
                "Nasdaq ETF share-class AUM unavailable; preserving "
                f"last-known-good value: {self._etf_errors.get(ticker, 'no value')}"
            )

        yfinance_observation, yfinance_error = self._try_yfinance(ticker)
        note = (
            "Yahoo totalAssets/netAssets may include a broader fund share "
            "class and is diagnostic only"
        )
        if yfinance_error:
            note += f"; yfinance cross-check unavailable: {yfinance_error}"
        return MarketCapObservation(
            ticker=ticker,
            asset_class=ASSET_ETF,
            semantic=ASSET_SEMANTICS[ASSET_ETF],
            market_cap=int(round(aum)),
            source="nasdaq.etf.summary.AUM",
            price=(yfinance_observation.price if yfinance_observation else None),
            quantity=(yfinance_observation.quantity if yfinance_observation else None),
            quantity_name=(
                yfinance_observation.quantity_name
                if yfinance_observation
                else None
            ),
            cross_check_market_cap=(
                yfinance_observation.market_cap
                if yfinance_observation
                else None
            ),
            cross_check_source=(
                yfinance_observation.source if yfinance_observation else None
            ),
            provider_note=note,
        )

    def fetch_observation(self, ticker: str) -> MarketCapObservation:
        normalized = ticker.upper()
        asset_class = asset_class_for_ticker(normalized)
        if asset_class == ASSET_EQUITY:
            return self._fetch_equity(normalized)
        if asset_class == ASSET_CRYPTO:
            return self._fetch_crypto(normalized)
        return self._fetch_etf(normalized)


_default_market_data_provider: MarketDataProvider | None = None


def fetch_market_cap_observation(ticker: str) -> MarketCapObservation:
    """Fetch from the appropriate primary provider with live secondary data."""
    global _default_market_data_provider
    if _default_market_data_provider is None:
        _default_market_data_provider = MarketDataProvider()
    return _default_market_data_provider.fetch_observation(ticker)


def _first_row(response: Any) -> Mapping[str, Any] | None:
    rows = getattr(response, "data", None) or []
    if not rows:
        return None
    row = rows[0]
    return row if isinstance(row, Mapping) else None


def load_previous_market_data(
    ticker: str, client: Any | None = None
) -> PreviousMarketData:
    """Load the current last-known-good cap and its best available price."""
    client = client or get_supabase_client()
    normalized = ticker.upper()
    try:
        stock_response = (
            client.table("stocks")
            .select("market_cap")
            .eq("ticker", normalized)
            .limit(1)
            .execute()
        )
        stock_row = _first_row(stock_response)
        if stock_row is None:
            raise MarketCapStateError(
                f"{normalized} is not present in the stocks table"
            )

        market_cap_number = _positive_number(stock_row.get("market_cap"))
        market_cap = (
            int(round(market_cap_number))
            if market_cap_number is not None
            else None
        )

        if market_cap is None:
            snapshot_response = (
                client.table("market_cap_snapshots")
                .select("market_cap")
                .eq("ticker", normalized)
                .order("date", desc=True)
                .limit(1)
                .execute()
            )
            snapshot_row = _first_row(snapshot_response)
            snapshot_number = _positive_number(
                snapshot_row.get("market_cap") if snapshot_row else None
            )
            if snapshot_number is not None:
                market_cap = int(round(snapshot_number))

        price_response = (
            client.table("stock_prices")
            .select("price")
            .eq("ticker", normalized)
            .limit(1)
            .execute()
        )
        price_row = _first_row(price_response)
        price = _positive_number(price_row.get("price") if price_row else None)
    except MarketCapStateError:
        raise
    except Exception as exc:
        raise MarketCapStateError(
            f"failed to read last-known-good state: {exc}"
        ) from exc

    return PreviousMarketData(market_cap=market_cap, price=price)


def _relative_difference(value: float, reference: float) -> float:
    return abs(value - reference) / abs(reference)


def validate_market_cap(
    observation: MarketCapObservation,
    previous: PreviousMarketData,
) -> ValidationResult:
    """Reject inconsistent values and unexplained large cap/AUM changes."""
    candidate = float(observation.market_cap)
    if not math.isfinite(candidate) or candidate <= 0:
        return ValidationResult(False, "candidate is not a positive finite value")

    formula_cap: float | None = None
    if observation.price is not None and observation.quantity is not None:
        formula_cap = observation.price * observation.quantity
        formula_difference = _relative_difference(candidate, formula_cap)
        formula_limit = FORMULA_TOLERANCE[observation.asset_class]
        if formula_difference > formula_limit:
            label = observation.quantity_name or "provider quantity"
            return ValidationResult(
                False,
                (
                    f"provider value differs {formula_difference:.1%} from "
                    f"price x {label} (limit {formula_limit:.0%})"
                ),
                expected_market_cap=int(round(formula_cap)),
            )

    cross_check_difference: float | None = None
    if (
        observation.asset_class == ASSET_EQUITY
        and observation.cross_check_market_cap is not None
    ):
        cross_check_difference = _relative_difference(
            candidate, float(observation.cross_check_market_cap)
        )
        # A current price x share-count formula is stronger evidence than a
        # provider's opaque cap field. Without that evidence, do not write when
        # Nasdaq and Yahoo materially disagree.
        if (
            formula_cap is None
            and cross_check_difference > EQUITY_CROSS_CHECK_TOLERANCE
        ):
            return ValidationResult(
                False,
                (
                    "equity providers disagree "
                    f"{cross_check_difference:.1%} (limit "
                    f"{EQUITY_CROSS_CHECK_TOLERANCE:.0%})"
                ),
                expected_market_cap=observation.cross_check_market_cap,
            )

    if previous.market_cap is None:
        return ValidationResult(
            True,
            "no previous value; accepted provider-backed initial value",
            expected_market_cap=(
                int(round(formula_cap)) if formula_cap is not None else None
            ),
        )

    previous_cap = float(previous.market_cap)

    change_pct = (candidate / previous_cap - 1.0) * 100.0
    move = abs(change_pct) / 100.0
    move_limit = UNEXPLAINED_MOVE_LIMIT[observation.asset_class]
    if move <= move_limit:
        return ValidationResult(
            True,
            f"change {change_pct:+.1f}% is within {move_limit:.0%} guard",
            change_pct=change_pct,
            expected_market_cap=(
                int(round(formula_cap)) if formula_cap is not None else None
            ),
        )

    if (
        observation.asset_class == ASSET_EQUITY
        and cross_check_difference is not None
        and cross_check_difference <= EQUITY_CROSS_CHECK_TOLERANCE
    ):
        return ValidationResult(
            True,
            (
                f"large change {change_pct:+.1f}% is supported by an "
                f"independent equity-cap cross-check ({cross_check_difference:.1%} difference)"
            ),
            change_pct=change_pct,
            expected_market_cap=observation.cross_check_market_cap,
        )

    if formula_cap is not None:
        label = observation.quantity_name or "provider quantity"
        return ValidationResult(
            True,
            (
                f"large change {change_pct:+.1f}% is supported by current "
                f"price x {label}"
            ),
            change_pct=change_pct,
            expected_market_cap=int(round(formula_cap)),
        )

    return ValidationResult(
        False,
        (
            f"unexplained change {change_pct:+.1f}% exceeds "
            f"{move_limit:.0%} guard; no supporting price/share data"
        ),
        change_pct=change_pct,
    )


def _execute_idempotent_write(
    operation: Callable[[], Any], description: str
) -> None:
    last_error: Exception | None = None
    for attempt in range(1, DB_WRITE_ATTEMPTS + 1):
        try:
            operation()
            return
        except Exception as exc:
            last_error = exc
            if attempt < DB_WRITE_ATTEMPTS:
                time.sleep(DB_WRITE_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"{description} failed after retry: {last_error}") from last_error


def update_market_cap(
    ticker: str,
    market_cap: int,
    client: Any | None = None,
    *,
    source: str = "unknown",
    metric: str | None = None,
) -> None:
    """Persist current value and daily snapshot in one database transaction."""
    client = client or get_supabase_client()
    normalized = ticker.upper()
    observed_at = datetime.now(timezone.utc).isoformat()
    metric = metric or ASSET_SEMANTICS[asset_class_for_ticker(normalized)]
    params = {
        "p_ticker": normalized,
        "p_market_cap": market_cap,
        "p_observed_at": observed_at,
        "p_source": source,
        "p_metric": metric,
    }
    _execute_idempotent_write(
        lambda: client.rpc(
            "upsert_market_cap_observation", params
        ).execute(),
        f"atomic market-cap observation write for {normalized}",
    )


def process_ticker(
    ticker: str,
    client: Any,
    *,
    dry_run: bool = False,
    fetcher: Callable[[str], MarketCapObservation] = fetch_market_cap_observation,
    state_loader: Callable[[str, Any], PreviousMarketData] = load_previous_market_data,
    updater: Callable[[str, int, Any], None] = update_market_cap,
) -> TickerOutcome:
    """Fetch, validate, and optionally persist one ticker."""
    normalized = ticker.upper()
    asset_class = asset_class_for_ticker(normalized)
    semantic = ASSET_SEMANTICS[asset_class]

    try:
        observation = fetcher(normalized)
    except Exception as exc:
        return TickerOutcome(
            ticker=normalized,
            asset_class=asset_class,
            semantic=semantic,
            status="failed",
            source="provider.error",
            reason=f"provider failure: {exc}",
            fallback_action="preserved_last_known_good",
        )

    try:
        previous = state_loader(normalized, client)
    except Exception as exc:
        return TickerOutcome(
            ticker=normalized,
            asset_class=asset_class,
            semantic=semantic,
            status="failed",
            source=observation.source,
            candidate_market_cap=observation.market_cap,
            reason=f"state lookup failure: {exc}",
            fallback_action="preserved_last_known_good",
            cross_check_market_cap=observation.cross_check_market_cap,
            cross_check_source=observation.cross_check_source,
            provider_note=observation.provider_note,
        )

    validation = validate_market_cap(observation, previous)
    if not validation.accepted:
        return TickerOutcome(
            ticker=normalized,
            asset_class=asset_class,
            semantic=semantic,
            status="failed",
            source=observation.source,
            previous_market_cap=previous.market_cap,
            candidate_market_cap=observation.market_cap,
            reason=f"validation rejected: {validation.reason}",
            fallback_action="preserved_last_known_good",
            cross_check_market_cap=observation.cross_check_market_cap,
            cross_check_source=observation.cross_check_source,
            provider_note=observation.provider_note,
        )

    if dry_run:
        return TickerOutcome(
            ticker=normalized,
            asset_class=asset_class,
            semantic=semantic,
            status="would_update",
            source=observation.source,
            previous_market_cap=previous.market_cap,
            candidate_market_cap=observation.market_cap,
            reason=validation.reason,
            cross_check_market_cap=observation.cross_check_market_cap,
            cross_check_source=observation.cross_check_source,
            provider_note=observation.provider_note,
        )

    try:
        updater(
            normalized,
            observation.market_cap,
            client,
            source=observation.source,
            metric=observation.semantic,
        )
    except Exception as exc:
        return TickerOutcome(
            ticker=normalized,
            asset_class=asset_class,
            semantic=semantic,
            status="failed",
            source=observation.source,
            previous_market_cap=previous.market_cap,
            candidate_market_cap=observation.market_cap,
            reason=f"database write failure: {exc}",
            fallback_action="preserved_or_retryable_provider_value",
            cross_check_market_cap=observation.cross_check_market_cap,
            cross_check_source=observation.cross_check_source,
            provider_note=observation.provider_note,
        )

    return TickerOutcome(
        ticker=normalized,
        asset_class=asset_class,
        semantic=semantic,
        status="updated",
        source=observation.source,
        previous_market_cap=previous.market_cap,
        candidate_market_cap=observation.market_cap,
        reason=validation.reason,
        cross_check_market_cap=observation.cross_check_market_cap,
        cross_check_source=observation.cross_check_source,
        provider_note=observation.provider_note,
    )


def _format_cap(value: int | None) -> str:
    if value is None:
        return "n/a"
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.1f}B"
    return f"${value / 1_000_000:.0f}M"


def _print_outcome(outcome: TickerOutcome) -> None:
    if outcome.status in {"updated", "would_update"}:
        verb = "would update" if outcome.status == "would_update" else "updated"
        print(
            f"  {outcome.ticker}: {_format_cap(outcome.candidate_market_cap)} "
            f"({verb}; {outcome.semantic}; {outcome.source})"
        )
        return
    print(f"  {outcome.ticker}: FAILED - {outcome.reason}")


def run_update(
    tickers: Sequence[str],
    client: Any,
    *,
    dry_run: bool = False,
    sleep_seconds: float = DEFAULT_SLEEP_SECONDS,
    processor: Callable[..., TickerOutcome] = process_ticker,
) -> RunSummary:
    summary = RunSummary()
    for index, ticker in enumerate(tickers):
        outcome = processor(ticker, client, dry_run=dry_run)
        summary.outcomes.append(outcome)
        _print_outcome(outcome)
        if sleep_seconds > 0 and index < len(tickers) - 1:
            time.sleep(sleep_seconds)
    return summary


def build_log_details(summary: RunSummary) -> dict[str, Any]:
    """Build structured details for the existing fetch_logs text column."""
    return {
        "fallback_policy": FALLBACK_POLICY,
        "semantics": ASSET_SEMANTICS,
        "source_by_ticker": {
            outcome.ticker: outcome.source
            for outcome in summary.outcomes
            if outcome.source
        },
        "cross_check_by_ticker": {
            outcome.ticker: {
                "source": outcome.cross_check_source,
                "market_cap": outcome.cross_check_market_cap,
            }
            for outcome in summary.outcomes
            if outcome.cross_check_source
        },
        "provider_note_by_ticker": {
            outcome.ticker: outcome.provider_note[:500]
            for outcome in summary.outcomes
            if outcome.provider_note
        },
        "failures": {
            outcome.ticker: outcome.reason[:500]
            for outcome in summary.outcomes
            if outcome.status == "failed"
        },
        "fallback_action_by_ticker": {
            outcome.ticker: outcome.fallback_action
            for outcome in summary.outcomes
            if outcome.fallback_action != "not_needed"
        },
    }


def _missing_failed_tickers_column(exc: Exception) -> bool:
    message = str(exc).lower()
    return "failed_tickers" in message and (
        "column" in message or "schema" in message or "pgrst" in message
    )


def log_result(
    job: str,
    status: str,
    fetched: int,
    failed: int | Sequence[str],
    error: str = "",
    *,
    failed_tickers: Sequence[str] | None = None,
    source_details: Mapping[str, Any] | None = None,
    client: Any | None = None,
) -> None:
    """Write fetch_logs details, degrading only for an older table schema."""
    client = client or get_supabase_client()
    if isinstance(failed, int):
        failed_count = failed
    else:
        failed_count = len(failed)
        if failed_tickers is None:
            failed_tickers = list(failed)

    details = dict(source_details or {})
    if error:
        details["error"] = error
    detail_text = (
        json.dumps(details, sort_keys=True, separators=(",", ":"))
        if details
        else None
    )
    payload = {
        "job_name": job,
        "status": status,
        "records_fetched": fetched,
        "records_failed": failed_count,
        "failed_tickers": list(failed_tickers) if failed_tickers else None,
        "error_message": detail_text,
    }

    try:
        client.table("fetch_logs").insert(payload).execute()
    except Exception as exc:
        if not _missing_failed_tickers_column(exc):
            print(f"Failed to log result to Supabase: {exc}")
            return

        # Older deployments may lack failed_tickers.  Preserve the same details
        # in error_message instead of dropping the log entirely.
        details["failed_tickers"] = list(failed_tickers or [])
        details["schema_warning"] = "fetch_logs.failed_tickers unavailable"
        legacy_payload = dict(payload)
        legacy_payload.pop("failed_tickers", None)
        legacy_payload["error_message"] = json.dumps(
            details, sort_keys=True, separators=(",", ":")
        )
        try:
            client.table("fetch_logs").insert(legacy_payload).execute()
        except Exception as legacy_exc:
            print(f"Failed to log result to Supabase: {legacy_exc}")


def _split_requested_tickers(values: Sequence[str]) -> list[str]:
    tickers: list[str] = []
    for value in values:
        tickers.extend(
            part.strip().upper() for part in value.split(",") if part.strip()
        )
    return list(dict.fromkeys(tickers))


def resolve_tickers(
    positional: Sequence[str],
    repeated: Sequence[str],
    asset_class: str,
) -> list[str]:
    aliases = {"stocks": ASSET_EQUITY, "equities": ASSET_EQUITY}
    normalized_class = aliases.get(asset_class, asset_class)
    requested = _split_requested_tickers([*positional, *repeated])

    if requested:
        unknown = [ticker for ticker in requested if ticker not in _ALL_SET]
        if unknown:
            raise ValueError(
                "unknown/untracked ticker(s): " + ", ".join(sorted(unknown))
            )
        if normalized_class != "all":
            mismatched = [
                ticker
                for ticker in requested
                if asset_class_for_ticker(ticker) != normalized_class
            ]
            if mismatched:
                raise ValueError(
                    f"ticker(s) do not belong to {normalized_class}: "
                    + ", ".join(mismatched)
                )
        return requested

    if normalized_class == ASSET_EQUITY:
        return list(ALL_EQUITY_TICKERS)
    if normalized_class == ASSET_ETF:
        return list(ETF_TICKERS)
    if normalized_class == ASSET_CRYPTO:
        return list(CRYPTO_TICKERS)
    return list(ALL_TICKERS)


def _nonnegative_float(value: str) -> float:
    number = float(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return number


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "tickers",
        nargs="*",
        help="explicit tracked ticker(s); comma-separated values are accepted",
    )
    parser.add_argument(
        "--ticker",
        dest="repeated_tickers",
        action="append",
        default=[],
        help="explicit tracked ticker; repeat this option as needed",
    )
    parser.add_argument(
        "--asset-class",
        choices=["all", ASSET_EQUITY, "stocks", "equities", ASSET_ETF, ASSET_CRYPTO],
        default="all",
        help="update one asset class when no explicit tickers are supplied",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch and validate, but perform no database or fetch-log writes",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=_nonnegative_float,
        default=DEFAULT_SLEEP_SECONDS,
        help="delay between provider requests (default: 0.3)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> RunSummary:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    try:
        tickers = resolve_tickers(
            args.tickers, args.repeated_tickers, args.asset_class
        )
    except ValueError as exc:
        parser.error(str(exc))

    client = get_supabase_client()
    mode = "Validating" if args.dry_run else "Updating"
    print(f"{mode} {len(tickers)} market-cap values...")
    summary = run_update(
        tickers,
        client,
        dry_run=args.dry_run,
        sleep_seconds=args.sleep_seconds,
    )

    if args.dry_run:
        print(
            f"\nDry run complete. Would update: {summary.would_update}, "
            f"Failed validation/fetch: {summary.failed}. No writes performed."
        )
        return summary

    status = "success" if summary.failed == 0 else "partial"
    log_result(
        "market_caps",
        status,
        summary.updated,
        summary.failed,
        failed_tickers=summary.failed_tickers,
        source_details=build_log_details(summary),
        client=client,
    )
    print(f"\nDone. Updated: {summary.updated}, Failed: {summary.failed}")
    return summary


if __name__ == "__main__":
    run_summary = main()
    # Surface partial provider/validation/write failures to schedulers so a
    # stale last-known-good value is visible and can be retried or investigated.
    raise SystemExit(1 if run_summary.failed else 0)
