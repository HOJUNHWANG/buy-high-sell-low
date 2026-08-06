"""
fetch_prices.py — Fetch tracked equities, ETFs, and crypto prices from Twelve Data.
Schedule: every 10 minutes (market hours filtered internally for equities/ETFs; crypto runs 24/7)
"""
import os
import sys
import time
import math
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import pytz
from datetime import date, datetime, timedelta
from typing import Sequence
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL        = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TWELVE_DATA_API_KEY = os.environ["TWELVE_DATA_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import ALL_EQUITY_TICKERS, CRYPTO_TICKERS, ETF_TICKERS, to_twelve_data_crypto
from price_adjustments import (
    calculate_change_pct,
    get_previous_closes,
    get_reviewed_anomaly_override,
    normalize_change_pct,
    provider_quote_observed_at,
    record_price_anomaly,
)
from market_calendar import is_market_holiday, previous_market_day

BATCH_SIZE = 25  # Recommended batch size for stocks
CRYPTO_BATCH_SIZE = 5  # Keep crypto requests small to reduce provider timeouts
SLEEP_PER_TICKER = 2.2  # Seconds to wait per ticker (55 credits/min plan, ~4min total)
HISTORY_DEDUP_MINUTES = 4  # Short overlap guard; keep below 10-min cron cadence
PROVIDER_CHANGE_WARNING_PCT = 1.0

# Configure retry strategy
retry_strategy = Retry(
    total=3,
    status_forcelist=[429, 500, 502, 503, 504, 520],
    allowed_methods=["HEAD", "GET", "OPTIONS"],
    backoff_factor=1  # 1s, 2s, 4s...
)
adapter = HTTPAdapter(max_retries=retry_strategy)
http_session = requests.Session()
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)


def safe_provider_error(error: Exception) -> str:
    """Bound provider errors and redact the API key before logs or stdout."""
    message = str(error)
    if TWELVE_DATA_API_KEY:
        message = message.replace(TWELVE_DATA_API_KEY, "[redacted]")
    return message[:500]


def is_market_open(now_et: datetime | None = None) -> bool:
    et = pytz.timezone("America/New_York")
    now_et = now_et or datetime.now(et)
    if now_et.weekday() >= 5 or is_market_holiday(now_et.date()):
        return False
    market_open  = now_et.replace(hour=9,  minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0,  second=0, microsecond=0)
    return market_open <= now_et <= market_close


def get_post_market_stock_fetch_mode(now_et: datetime | None = None) -> str | None:
    """Return the after-hours stock fetch window, if any.

    regular_close catches the first closing print, while settlement_close runs
    once later after providers have had time to settle final OHLC values.
    """
    et = pytz.timezone("America/New_York")
    now_et = now_et or datetime.now(et)
    is_session_day = (
        now_et.weekday() < 5 and not is_market_holiday(now_et.date())
    )
    if not is_session_day:
        return "settlement_catchup"
    close_time = now_et.replace(hour=16, minute=0,  second=0, microsecond=0)
    final_time = now_et.replace(hour=16, minute=30, second=0, microsecond=0)
    settlement_start = now_et.replace(hour=16, minute=45, second=0, microsecond=0)
    settlement_end = now_et.replace(hour=17, minute=15, second=0, microsecond=0)
    if close_time < now_et <= final_time:
        return "regular_close"
    if settlement_start <= now_et <= settlement_end:
        return "settlement_close"
    # If the normal settlement window was lost to an infrastructure outage,
    # keep one bounded recovery opportunity alive until the next session opens.
    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    if now_et > settlement_end or now_et < market_open:
        return "settlement_catchup"
    return None


def settlement_market_date(now_et: datetime | None = None) -> date:
    """Return the latest session whose final close should be settled."""
    et = pytz.timezone("America/New_York")
    now_et = now_et or datetime.now(et)
    session_date = now_et.date()
    is_session_day = (
        now_et.weekday() < 5 and not is_market_holiday(session_date)
    )
    close_time = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    if not is_session_day or now_et < close_time:
        return previous_market_day(session_date)
    return session_date


def already_completed_settlement_close_today(
    now_et: datetime | None = None,
) -> bool:
    """Return whether the target session has one complete settlement refresh."""
    et = pytz.timezone("America/New_York")
    now_et = now_et or datetime.now(et)
    target_date = settlement_market_date(now_et)
    settlement_start_et = et.localize(
        datetime(target_date.year, target_date.month, target_date.day, 16, 45)
    )
    settlement_start_utc = settlement_start_et.astimezone(pytz.utc).isoformat()
    expected_count = len(ALL_EQUITY_TICKERS) + len(ETF_TICKERS)
    result = supabase.table("fetch_logs") \
        .select("id") \
        .eq("job_name", "prices_close_settlement") \
        .eq("status", "success") \
        .eq("records_failed", 0) \
        .gte("records_fetched", expected_count) \
        .gte("executed_at", settlement_start_utc) \
        .limit(1) \
        .execute()
    return len(result.data or []) > 0


def fetch_batch(tickers: list[str]) -> dict:
    symbols = ",".join(tickers)
    # Manual URL construction to avoid potential issues with encoded '/' in crypto symbols
    url = f"https://api.twelvedata.com/quote?symbol={symbols}&apikey={TWELVE_DATA_API_KEY}"
    
    # Increased timeout to 60s for batches to handle potential server lags
    r = http_session.get(url, timeout=60)
    r.raise_for_status()
    data = r.json()

    # Top-level error response (e.g. rate limit, invalid key)
    if isinstance(data, dict) and data.get("status") == "error":
        raise Exception(f"Twelve Data API error {data.get('code', '?')}: {data.get('message', 'unknown')}")

    # Single ticker returns flat dict, multiple returns nested
    if len(tickers) == 1:
        return {tickers[0]: data} if "close" in data else {}
    return data


def build_current_price_row(
    *,
    ticker: str,
    price: float,
    change_pct: float | None,
    volume: int | None,
    ingested_at: datetime,
) -> dict:
    """Build the current-price row with an unambiguous ingestion timestamp."""
    if ingested_at.tzinfo is None:
        ingested_at = pytz.utc.localize(ingested_at)
    return {
        "ticker": ticker,
        "price": price,
        "change_pct": change_pct,
        "volume": volume,
        # ``fetched_at`` is consumed by freshness UI and trading guards. It is
        # therefore the time our worker received the quote, not Twelve Data's
        # session-boundary metadata timestamp.
        "fetched_at": ingested_at.astimezone(pytz.utc).isoformat(),
    }


def upsert_prices(results: dict, force_history: bool = False, ticker_map: dict | None = None) -> tuple[int, list[str]]:
    """Upsert price data. ticker_map converts API symbols back to DB tickers (for crypto)."""
    fetched, failed = 0, []
    ingested_at = datetime.now(pytz.utc)
    now = ingested_at.isoformat()
    cutoff = (ingested_at - timedelta(minutes=HISTORY_DEDUP_MINUTES)).isoformat()

    resolved_tickers = {
        api_ticker: ticker_map.get(api_ticker, api_ticker) if ticker_map else api_ticker
        for api_ticker in results
    }
    et_market_date = datetime.now(
        pytz.timezone("America/New_York")
    ).date().isoformat()
    utc_market_date = datetime.now(pytz.utc).date().isoformat()
    previous_closes: dict[tuple[str, str], float] = {}

    # Batches are normally all equities/ETFs or all crypto, but grouping by
    # reference date keeps the helper correct if a mixed batch is ever used.
    tickers_by_reference: dict[tuple[str, str], list[str]] = {}
    for db_ticker in resolved_tickers.values():
        is_crypto = db_ticker.endswith("-USD")
        market_date = utc_market_date if is_crypto else et_market_date
        current_date = datetime.fromisoformat(market_date).date()
        reference_date = (
            current_date - timedelta(days=1)
            if is_crypto
            else previous_market_day(current_date)
        ).isoformat()
        tickers_by_reference.setdefault(
            (market_date, reference_date), []
        ).append(db_ticker)

    for (market_date, reference_date), db_tickers in tickers_by_reference.items():
        closes, close_lookup_error = get_previous_closes(
            supabase,
            tickers=db_tickers,
            close_date=reference_date,
        )
        previous_closes.update(
            ((ticker, market_date), close) for ticker, close in closes.items()
        )
        if close_lookup_error:
            print(
                f"  Warning: failed to load stored previous closes for "
                f"{reference_date}: {close_lookup_error}"
            )

    for api_ticker, data in results.items():
        if not isinstance(data, dict) or "close" not in data:
            failed.append(api_ticker)
            continue

        # Convert API ticker back to DB ticker if mapping exists
        db_ticker = resolved_tickers[api_ticker]
        is_crypto = db_ticker.endswith("-USD")

        try:
            price = float(data["close"])
            if not math.isfinite(price) or price <= 0:
                raise ValueError("close must be a positive finite number")
            parsed_ohlc: dict[str, float] = {}
            for field in ("open", "high", "low"):
                value = data.get(field)
                if value in (None, ""):
                    continue
                parsed = float(value)
                if not math.isfinite(parsed) or parsed <= 0:
                    raise ValueError(f"{field} must be a positive finite number")
                parsed_ohlc[field] = parsed
            low = parsed_ohlc.get("low")
            high = parsed_ohlc.get("high")
            if low is not None and high is not None:
                if low > high or price < low * 0.999 or price > high * 1.001:
                    raise ValueError("close is inconsistent with provider high/low")
        except (TypeError, ValueError, OverflowError) as exc:
            print(f"  Rejected invalid quote for {db_ticker}: {exc}")
            failed.append(api_ticker)
            continue
        try:
            _provider_observed_at = provider_quote_observed_at(
                data,
                fallback=ingested_at,
                is_crypto=is_crypto,
            )
        except (TypeError, ValueError, OverflowError) as exc:
            print(f"  Rejected invalid quote time for {db_ticker}: {exc}")
            failed.append(api_ticker)
            continue
        provider_change_pct = (
            float(data["percent_change"])
            if data.get("percent_change") not in (None, "")
            else None
        )
        market_date = utc_market_date if is_crypto else et_market_date
        previous_close = previous_closes.get((db_ticker.upper(), market_date))
        calculated_change_pct, change_source = calculate_change_pct(
            price,
            previous_close,
            provider_change_pct,
        )
        change_pct, adjustment_note, anomaly_reason = normalize_change_pct(
            db_ticker,
            market_date,
            calculated_change_pct,
            is_crypto=is_crypto,
        )
        if change_source == "provider_fallback":
            print(
                f"  Warning: {db_ticker} has no stored close before "
                f"{market_date}; falling back to provider percent change"
            )
        elif (
            provider_change_pct is not None
            and calculated_change_pct is not None
            and abs(provider_change_pct - calculated_change_pct)
            >= PROVIDER_CHANGE_WARNING_PCT
        ):
            print(
                f"  Provider change mismatch: {db_ticker} "
                f"provider={provider_change_pct:.4f}% "
                f"stored-close={calculated_change_pct:.4f}%"
            )
        reviewed_override, review_lookup_error = get_reviewed_anomaly_override(
            supabase,
            ticker=db_ticker,
            market_date=market_date,
            reason=anomaly_reason,
        )
        if reviewed_override is not None:
            change_pct = reviewed_override
            adjustment_note = (
                f"{db_ticker} {market_date}: applied admin-reviewed "
                f"change {reviewed_override}%"
            )
        if review_lookup_error:
            print(
                f"  Warning: failed to check reviewed anomaly for "
                f"{db_ticker}: {review_lookup_error}"
            )
        if adjustment_note:
            print(f"  Price adjustment: {adjustment_note}")
        volume     = int(data["volume"])             if data.get("volume")         not in (None, "") else None

        # Parse and validate provider time independently, but do not confuse a
        # session-open timestamp with when this worker actually fetched data.
        # Keeping the name explicit also prevents a future regression when the
        # schema gains a dedicated provider-observation metadata column.
        row_price = build_current_price_row(
            ticker=db_ticker,
            price=price,
            change_pct=change_pct,
            volume=volume,
            ingested_at=ingested_at,
        )
        row_long = {
            "ticker": db_ticker,
            "date":   market_date,
            "close":  price,
        }
        row_long.update(parsed_ohlc)
        if volume is not None:
            row_long["volume"] = volume

        # Always update current price
        supabase.table("stock_prices").upsert(row_price).execute()

        anomaly_error = record_price_anomaly(
            supabase,
            ticker=db_ticker,
            market_date=market_date,
            price=price,
            provider_change_pct=provider_change_pct,
            applied_change_pct=change_pct,
            reason=anomaly_reason,
            details=adjustment_note,
        )
        if anomaly_error:
            print(
                f"  Warning: failed to record price anomaly for "
                f"{db_ticker}: {anomaly_error}"
            )

        # Only insert history if no recent entry (prevents duplicate rows)
        should_insert_history = force_history
        if not should_insert_history:
            recent = supabase.table("stock_price_history") \
                .select("id") \
                .eq("ticker", db_ticker) \
                .gte("recorded_at", cutoff) \
                .limit(1) \
                .execute()
            should_insert_history = len(recent.data) == 0

        if should_insert_history:
            try:
                supabase.table("stock_price_history").insert({
                    "ticker": db_ticker, "price": price, "recorded_at": now,
                }).execute()
            except Exception as e:
                print(f"  Warning: failed to record to stock_price_history for {db_ticker}: {e}")

        try:
            supabase.table("price_history_long").upsert(row_long, on_conflict="ticker,date").execute()
        except Exception as e:
            # Most likely 'id' column default issue or constraint
            print(f"  Warning: failed to record to price_history_long for {db_ticker}: {e}")
        fetched += 1

    return fetched, failed


def fetch_selected_prices(
    tickers: Sequence[str], *, force_history: bool = True
) -> tuple[int, list[str]]:
    """Refresh an explicit set of DB tickers, regardless of market hours.

    This is intentionally separate from ``main`` so the audit remediator can
    retry only the affected rows. Provider symbols are converted back to the
    application's ticker format in every failure path.
    """
    requested = list(
        dict.fromkeys(str(ticker).strip().upper() for ticker in tickers if ticker)
    )
    crypto = [ticker for ticker in requested if ticker in CRYPTO_TICKERS]
    stocks = [ticker for ticker in requested if ticker not in CRYPTO_TICKERS]
    total_fetched = 0
    failed_db_tickers: list[str] = []

    def refresh_batches(
        db_tickers: list[str], batch_size: int, *, crypto_symbols: bool
    ) -> None:
        nonlocal total_fetched
        if not db_tickers:
            return

        api_tickers = (
            [to_twelve_data_crypto(ticker) for ticker in db_tickers]
            if crypto_symbols
            else db_tickers
        )
        ticker_map = (
            {
                to_twelve_data_crypto(ticker): ticker
                for ticker in db_tickers
            }
            if crypto_symbols
            else {}
        )
        for offset in range(0, len(api_tickers), batch_size):
            batch = api_tickers[offset : offset + batch_size]
            try:
                results = fetch_batch(batch)
                returned = set(results) if isinstance(results, dict) else set()
                missing = [symbol for symbol in batch if symbol not in returned]
                if not isinstance(results, dict):
                    results = {}
                fetched, failed = upsert_prices(
                    results,
                    force_history=force_history,
                    ticker_map=ticker_map or None,
                )
                total_fetched += fetched
                for symbol in [*missing, *failed]:
                    failed_db_tickers.append(ticker_map.get(symbol, symbol))
            except Exception as exc:
                print(
                    "  Targeted price refresh failed for "
                    f"{', '.join(batch)}: {safe_provider_error(exc)}"
                )
                failed_db_tickers.extend(
                    ticker_map.get(symbol, symbol) for symbol in batch
                )

    refresh_batches(stocks, BATCH_SIZE, crypto_symbols=False)
    refresh_batches(crypto, CRYPTO_BATCH_SIZE, crypto_symbols=True)
    return total_fetched, sorted(set(failed_db_tickers))


def log_result(job: str, status: str, fetched: int, failed: list[str], error: str = ""):
    supabase.table("fetch_logs").insert({
        "job_name":        job,
        "status":          status,
        "records_fetched": fetched,
        "records_failed":  len(failed),
        "failed_tickers":  failed or None,
        "error_message":   error or None,
    }).execute()


def fetch_crypto_twelve_data() -> tuple[int, list[str]]:
    """Fetch crypto prices via Twelve Data (24/7, no market hours check)."""
    if not CRYPTO_TICKERS:
        return 0, []
    print(f"\nFetching crypto prices for {len(CRYPTO_TICKERS)} tickers via Twelve Data...")

    # Build API symbols and mapping back to DB tickers
    # Twelve Data uses BTC/USD format, our DB uses BTC-USD
    api_symbols = [to_twelve_data_crypto(t) for t in CRYPTO_TICKERS]
    ticker_map = {to_twelve_data_crypto(t): t for t in CRYPTO_TICKERS}

    total_fetched, all_failed = 0, []
    batches = [api_symbols[i:i+CRYPTO_BATCH_SIZE] for i in range(0, len(api_symbols), CRYPTO_BATCH_SIZE)]

    for i, batch in enumerate(batches):
        try:
            print(f"  Batch {i+1}/{len(batches)}: Fetching {len(batch)} tickers...")
            results = fetch_batch(batch)
            if not results:
                print(f"    Warning: No data for batch {i+1}")
                all_failed.extend(batch)
            else:
                fetched, failed = upsert_prices(results, ticker_map=ticker_map)
                total_fetched += fetched
                returned = set(results)
                missing = [symbol for symbol in batch if symbol not in returned]
                all_failed.extend([*missing, *failed])
            
            # Dynamic sleep based on batch size to stay within rate limits (55/min)
            if i < len(batches) - 1:
                sleep_time = len(batch) * SLEEP_PER_TICKER
                print(f"    Waiting {sleep_time:.1f}s...")
                time.sleep(sleep_time)
        except Exception as e:
            err_msg = safe_provider_error(e)
            print(f"    Error details: {err_msg}")
            if "Max retries exceeded" in err_msg or "Read timed out" in err_msg:
                print(f"    ⚠️ Timeout/Retry Error for batch {i+1} (Twelve Data server status: DOWN/SLOW)")
            else:
                print(f"    ❌ Error fetching batch {i+1}: {err_msg}")
            all_failed.extend(batch)

    all_failed = sorted(set(all_failed))
    log_result("crypto_prices", "success" if not all_failed else "partial", total_fetched, all_failed)
    print(f"Crypto done. Fetched: {total_fetched}, Failed: {len(all_failed)}")
    return total_fetched, all_failed


def main() -> int:
    run_failed: list[str] = []
    # Always fetch crypto (24/7 market)
    try:
        _, crypto_failed = fetch_crypto_twelve_data()
        run_failed.extend(crypto_failed)
    except Exception as e:
        print(f"Crypto fetch error: {e}")
        run_failed.extend(CRYPTO_TICKERS)

    # Stocks: during market hours OR post-market-close final/settlement fetches.
    # Keep the later settlement-close refresh; fetch_logs limits completed runs to once per day.
    post_market_mode = get_post_market_stock_fetch_mode()
    settlement_modes = {"settlement_close", "settlement_catchup"}
    if (
        post_market_mode in settlement_modes
        and already_completed_settlement_close_today()
    ):
        print("Settlement close stock fetch already ran today — skipping stocks.")
        return 1 if run_failed else 0

    post_market = post_market_mode is not None
    if not is_market_open() and not post_market:
        print("Stock market closed — skipping stocks.")
        return 1 if run_failed else 0

    if post_market_mode == "regular_close":
        print("Post-market close window — fetching final closing prices...")
    elif post_market_mode == "settlement_close":
        print("Settlement close window — refreshing final closing prices once more...")
    elif post_market_mode == "settlement_catchup":
        print(
            "Settlement window was missed — running one final-close catch-up "
            "before the next session..."
        )

    stock_tickers = ALL_EQUITY_TICKERS + ETF_TICKERS
    print(f"Fetching prices for {len(stock_tickers)} stock tickers...")
    total_fetched, all_failed = 0, []

    batches = [stock_tickers[i:i+BATCH_SIZE] for i in range(0, len(stock_tickers), BATCH_SIZE)]

    for i, batch in enumerate(batches):
        try:
            print(f"  Batch {i+1}/{len(batches)}: Fetching {len(batch)} tickers...")
            results = fetch_batch(batch)
            if not results:
                print(f"    Warning: No data for batch {i+1}")
                all_failed.extend(batch)
            else:
                fetched, failed = upsert_prices(results, force_history=post_market)
                total_fetched += fetched
                returned = set(results)
                missing = [symbol for symbol in batch if symbol not in returned]
                all_failed.extend([*missing, *failed])
            
            # Dynamic sleep
            if i < len(batches) - 1:
                sleep_time = len(batch) * SLEEP_PER_TICKER
                print(f"    Waiting {sleep_time:.1f}s...")
                time.sleep(sleep_time)
        except Exception as e:
            err_msg = safe_provider_error(e)
            print(f"    Error details: {err_msg}")
            if "Max retries exceeded" in err_msg or "Read timed out" in err_msg:
                print(f"    ⚠️ Timeout/Retry Error for batch {i+1} (Twelve Data server status: DOWN/SLOW)")
            else:
                print(f"    ❌ Error fetching batch {i+1}: {err_msg}")
            all_failed.extend(batch)

    all_failed = sorted(set(all_failed))
    status = "success" if not all_failed else "partial"
    log_job = (
        "prices_close_settlement"
        if post_market_mode in settlement_modes
        else "prices"
    )
    log_result(log_job, status, total_fetched, all_failed)
    print(f"Done. Fetched: {total_fetched}, Failed: {len(all_failed)}")
    run_failed.extend(all_failed)
    return 1 if run_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
