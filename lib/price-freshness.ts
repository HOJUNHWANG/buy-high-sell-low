import { timeAgo } from "./utils";

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
