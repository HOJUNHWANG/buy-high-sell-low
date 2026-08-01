import { timeAgo } from "./utils";
import {
  getEasternTime,
  getLatestCompletedTradingDate,
  getMarketStatus,
  isCrypto,
} from "./market-hours";

export const PRICE_STALE_MINUTES = 20;
export const PRICE_FUTURE_SKEW_MINUTES = 5;

export function priceAgeMinutes(
  fetchedAt: string | null | undefined,
  now = new Date(),
): number | null {
  if (!fetchedAt) return null;
  const ts = new Date(fetchedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((now.getTime() - ts) / 60_000));
}

export function priceFreshnessLabel(
  fetchedAt: string | null | undefined,
  now = new Date(),
): string {
  if (!fetchedAt) return "No timestamp";
  return `Updated ${timeAgo(fetchedAt, now)}`;
}

export function isPriceStale(
  fetchedAt: string | null | undefined,
  staleMinutes = PRICE_STALE_MINUTES,
  now = new Date(),
): boolean {
  const age = priceAgeMinutes(fetchedAt, now);
  return age == null || age >= staleMinutes;
}

/**
 * Closed equities are settled only when the quote was fetched around the most
 * recently completed regular close. A quote from an older session (or from
 * early in the expected session) remains visibly delayed.
 */
export function isLatestCompletedSessionQuote(
  fetchedAt: string,
  now = new Date(),
  closeToleranceMinutes = PRICE_STALE_MINUTES,
): boolean {
  const fetchedDate = new Date(fetchedAt);
  if (!Number.isFinite(fetchedDate.getTime()) || fetchedDate.getTime() > now.getTime()) return false;

  const fetchedEt = getEasternTime(fetchedDate);
  return (
    fetchedEt.date === getLatestCompletedTradingDate(now)
    && fetchedEt.mins >= 960 - closeToleranceMinutes
  );
}

export type PriceFreshness = {
  state: "live" | "delayed" | "settled" | "unavailable";
  label: string;
};

/**
 * A closed US equity market is an expected settled-data state, not stale data.
 * Crypto remains subject to freshness checks because it trades continuously.
 */
export function getPriceFreshness(
  fetchedAt: string | null | undefined,
  ticker?: string,
  now = new Date(),
  staleMinutes = PRICE_STALE_MINUTES,
): PriceFreshness {
  if (!fetchedAt) return { state: "unavailable", label: "Price unavailable" };
  if (!Number.isFinite(new Date(fetchedAt).getTime())) {
    return { state: "unavailable", label: "Price unavailable" };
  }
  if (
    new Date(fetchedAt).getTime()
    > now.getTime() + PRICE_FUTURE_SKEW_MINUTES * 60_000
  ) {
    return { state: "unavailable", label: "Invalid quote time" };
  }

  const equityMarketOpen = getMarketStatus(now).isOpen;
  if (ticker && !isCrypto(ticker) && !equityMarketOpen) {
    if (isLatestCompletedSessionQuote(fetchedAt, now)) {
      return { state: "settled", label: "Last market close" };
    }
    return { state: "delayed", label: "Update delayed" };
  }

  if (isPriceStale(fetchedAt, staleMinutes, now)) {
    return { state: "delayed", label: "Update delayed" };
  }

  return { state: "live", label: priceFreshnessLabel(fetchedAt, now) };
}
