import { getPriceFreshness, PRICE_STALE_MINUTES } from "@/lib/price-freshness";

export function PriceFreshnessBadge({
  fetchedAt,
  ticker,
  compact = false,
  staleMinutes = PRICE_STALE_MINUTES,
}: {
  fetchedAt?: string | null;
  ticker?: string;
  compact?: boolean;
  staleMinutes?: number;
}) {
  const freshness = getPriceFreshness(fetchedAt, ticker, new Date(), staleMinutes);
  const styles = {
    live: { color: "var(--text-3)", background: "var(--surface-2)", dot: "var(--up)", border: "1px solid var(--border)" },
    delayed: { color: "var(--warn)", background: "var(--warn-dim)", dot: "var(--warn)", border: "1px solid rgba(251,191,36,0.2)" },
    settled: { color: "var(--text-2)", background: "var(--surface-2)", dot: "var(--text-3)", border: "1px solid var(--border)" },
    unavailable: { color: "var(--down)", background: "var(--down-dim)", dot: "var(--down)", border: "1px solid rgba(248,113,113,0.2)" },
  }[freshness.state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}
      title={fetchedAt ? new Date(fetchedAt).toLocaleString() : "No price timestamp"}
      style={{
        color: styles.color,
        background: styles.background,
        border: styles.border,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: styles.dot }} />
      {compact && freshness.state === "live" ? freshness.label.replace("Updated ", "") : freshness.label}
    </span>
  );
}
