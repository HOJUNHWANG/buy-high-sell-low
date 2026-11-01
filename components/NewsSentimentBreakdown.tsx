import { sentimentDistribution, type SentimentBreakdown } from "@/lib/news-sentiment";

export function NewsSentimentBreakdown({ breakdown, newsCount }: { breakdown: SentimentBreakdown; newsCount: number }) {
  const { total, counts, percentages } = sentimentDistribution(breakdown, newsCount);
  if (!total) return <p className="text-xs" style={{ color: "var(--text-2)" }}>No articles in this brief.</p>;
  const striped = "repeating-linear-gradient(135deg,var(--surface-3) 0,var(--surface-3) 4px,var(--text-3) 4px,var(--text-3) 5px)";
  const segments = [
    { key: "positive", label: "Positive", color: "var(--up)", background: "var(--up)" },
    { key: "neutral", label: "Neutral", color: "var(--text-3)", background: "var(--text-3)" },
    { key: "negative", label: "Negative", color: "var(--down)", background: "var(--down)" },
    { key: "unknown", label: "Not analysed", color: "var(--text-2)", background: striped },
  ] as const;
  return (
    <div className="space-y-2">
      <div role="img" aria-label={segments.map(s => `${s.label} ${percentages[s.key]}%`).join(", ")}
        className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
        {segments.map(s => percentages[s.key] > 0 && <div key={s.key} aria-hidden="true"
          style={{ flex: `0 0 ${percentages[s.key]}%`, background: s.background }} />)}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {segments.map(s => <span key={s.key} className="flex items-center gap-1.5" style={{ color: s.color }}>
          <span aria-hidden="true" className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.background }} />
          {s.label} {percentages[s.key]}%{counts ? ` (${counts[s.key]})` : ""}
        </span>)}
      </div>
      <p className="text-[10px]" style={{ color: "var(--text-2)" }}>
        {counts ? `${total - counts.unknown} of ${total} articles analysed · ${counts.unknown} not analysed`
          : `${total} articles in this brief · ${percentages.unknown}% not analysed`}
      </p>
      <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
        Not analysed means no verified sentiment is available. Percentages are rounded.
      </p>
    </div>
  );
}
