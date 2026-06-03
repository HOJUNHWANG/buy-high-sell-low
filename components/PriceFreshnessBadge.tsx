import { isPriceStale, priceFreshnessLabel, PRICE_STALE_MINUTES } from "@/lib/price-freshness";

export function PriceFreshnessBadge({
  fetchedAt,
  compact = false,
  staleMinutes = PRICE_STALE_MINUTES,
}: {
  fetchedAt?: string | null;
  compact?: boolean;
  staleMinutes?: number;
}) {
  const stale = isPriceStale(fetchedAt, staleMinutes);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}
      title={fetchedAt ? new Date(fetchedAt).toLocaleString() : "No price timestamp"}
      style={{
        color: stale ? "var(--down)" : "var(--text-3)",
        background: stale ? "var(--down-dim)" : "var(--surface-2)",
        border: stale ? "1px solid rgba(248,113,113,0.2)" : "1px solid var(--border)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: stale ? "var(--down)" : "var(--up)" }} />
      {stale ? "Stale" : compact ? priceFreshnessLabel(fetchedAt).replace("Updated ", "") : priceFreshnessLabel(fetchedAt)}
    </span>
  );
}
