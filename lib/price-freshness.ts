import { timeAgo } from "./utils";
import { getMarketStatus, isCrypto } from "./market-hours";

export const PRICE_STALE_MINUTES = 20;

export function priceAgeMinutes(fetchedAt: string | null | undefined): number | null {
  if (!fetchedAt) return null;
  const ts = new Date(fetchedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 60_000));
}

export function priceFreshnessLabel(fetchedAt: string | null | undefined): string {
  if (!fetchedAt) return "No timestamp";
  return `Updated ${timeAgo(fetchedAt)}`;
}

export function isPriceStale(fetchedAt: string | null | undefined, staleMinutes = PRICE_STALE_MINUTES): boolean {
  const age = priceAgeMinutes(fetchedAt);
  return age == null || age >= staleMinutes;
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

  const equityMarketOpen = getMarketStatus(now).isOpen;
  if (ticker && !isCrypto(ticker) && !equityMarketOpen) {
    return { state: "settled", label: "Last market close" };
  }

  if (isPriceStale(fetchedAt, staleMinutes)) {
    return { state: "delayed", label: "Update delayed" };
  }

  return { state: "live", label: priceFreshnessLabel(fetchedAt) };
}
