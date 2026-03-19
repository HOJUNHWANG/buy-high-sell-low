export function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const color =
    sentiment === "positive" ? "var(--up)"   :
    sentiment === "negative" ? "var(--down)" :
    "var(--text-3)";
  const bg =
    sentiment === "positive" ? "var(--up-dim)"   :
    sentiment === "negative" ? "var(--down-dim)" :
    "var(--surface-3)";
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: bg, color }}
    >
      {sentiment}
    </span>
  );
}
