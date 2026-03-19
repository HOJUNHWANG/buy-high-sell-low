import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function TrendingTickersWidget() {
  const supabase = await createSupabaseServerClient();

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("news_articles")
    .select("ticker, ai_sentiment")
    .gte("published_at", yesterday)
    .not("ticker", "is", null);

  // Count mentions + sentiment score per ticker
  const map = new Map<string, { count: number; pos: number; neg: number }>();
  for (const row of data ?? []) {
    if (!row.ticker) continue;
    const entry = map.get(row.ticker) ?? { count: 0, pos: 0, neg: 0 };
    entry.count++;
    if (row.ai_sentiment === "positive") entry.pos++;
    if (row.ai_sentiment === "negative") entry.neg++;
    map.set(row.ticker, entry);
  }

  const trending = Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  if (trending.length === 0) return null;

  return (
    <div className="card rounded-xl p-3 space-y-3">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-3)" }}
      >
        Trending (24h)
      </p>

      <div className="space-y-1.5">
        {trending.map(([ticker, { count, pos, neg }]) => {
          const mood =
            pos > neg ? "var(--up)" :
            neg > pos ? "var(--down)" :
            "var(--text-3)";

          return (
            <Link
              key={ticker}
              href={`/stock/${ticker}`}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface-2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: mood }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  {ticker}
                </span>
              </div>
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                {count} article{count !== 1 ? "s" : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
