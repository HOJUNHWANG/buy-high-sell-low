"""Normalize provider-reported daily percentage changes.

Prices remain untouched. Only the derived daily percentage is adjusted or
suppressed when a known corporate action makes the provider value misleading.
"""

from __future__ import annotations


EXTREME_EQUITY_CHANGE_PCT = 40.0

# Corporate-action values are intentionally explicit and date-scoped. They
# should be removed only after the historical record no longer needs to be
# reproducible. HON completed the HONA spin-off and a 1-for-2 reverse split on
# 2026-06-29; -6.45% is the corporate-action-adjusted regular-session change.
CORPORATE_ACTION_CHANGE_OVERRIDES: dict[tuple[str, str], float] = {
    ("HON", "2026-06-29"): -6.45,
}


def normalize_change_pct(
    ticker: str,
    market_date: str,
    provider_change_pct: float | None,
    *,
    is_crypto: bool = False,
) -> tuple[float | None, str | None]:
    """Return a safe display change and an optional audit message.

    Known corporate actions take precedence. Unreviewed extreme stock and ETF
    moves are suppressed rather than being published as market moves. Crypto is
    excluded because moves of this size can be legitimate in that asset class.
    """
    normalized_ticker = ticker.upper()
    override = CORPORATE_ACTION_CHANGE_OVERRIDES.get(
        (normalized_ticker, market_date)
    )
    if override is not None:
        return override, (
            f"{normalized_ticker} {market_date}: corporate-action override "
            f"{provider_change_pct!r}% -> {override}%"
        )

    if (
        provider_change_pct is not None
        and not is_crypto
        and abs(provider_change_pct) >= EXTREME_EQUITY_CHANGE_PCT
    ):
        return None, (
            f"{normalized_ticker} {market_date}: suppressed unreviewed "
            f"provider change {provider_change_pct}%"
        )

    return provider_change_pct, None
