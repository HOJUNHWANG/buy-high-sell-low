import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function SentimentWidget() {
  const supabase = await createSupabaseServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("news_articles")
    .select("ai_sentiment")
    .gte("fetched_at", todayStart.toISOString())
    .not("ai_sentiment", "is", null);

  let pos = 0, neu = 0, neg = 0;
  for (const row of data ?? []) {
    if (row.ai_sentiment === "positive") pos++;
    else if (row.ai_sentiment === "negative") neg++;
    else neu++;
  }

  const total = pos + neu + neg;
  if (total === 0) return null;

  const posPct  = Math.round((pos / total) * 100);
  const negPct  = Math.round((neg / total) * 100);
  const neuPct  = 100 - posPct - negPct;

  const mood =
    posPct > 55 ? "Bullish" :
    negPct > 55 ? "Bearish" :
    posPct > negPct ? "Slightly Bullish" :
    negPct > posPct ? "Slightly Bearish" :
    "Neutral";

  const moodColor =
    mood.includes("Bullish") ? "var(--up)" :
    mood.includes("Bearish") ? "var(--down)" :
    "var(--text-2)";

  return (
    <div className="card rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-3)" }}
        >
          News Sentiment
        </p>
        <Link
          href="/news"
          className="text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          All →
        </Link>
      </div>

      <div>
        <span className="text-sm font-bold" style={{ color: moodColor }}>
          {mood}
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
          {total} articles today
        </p>
      </div>

      <div className="space-y-2">
        {[
          { label: "Positive", pct: posPct, count: pos,  color: "var(--up)"    },
          { label: "Neutral",  pct: neuPct, count: neu,  color: "var(--text-3)" },
          { label: "Negative", pct: negPct, count: neg,  color: "var(--down)"  },
        ].map(({ label, pct, count, color }) => (
          <div key={label}>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span style={{ color: "var(--text-3)" }}>{label}</span>
              <span style={{ color }} className="font-semibold">
                {count}
              </span>
            </div>
            <div
              className="h-1 rounded-full"
              style={{ background: "var(--surface-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: color, opacity: 0.7 }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
        Not investment advice
      </p>
    </div>
  );
}
