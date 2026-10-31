import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function TrendingTickersWidget() {
  let data: { related_tickers: string[] | null; ai_sentiment: string | null; event_key: string | null; id: number }[] | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line react-hooks/purity -- evaluated once for this server request
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await supabase
      .from("news_articles")
      .select("id, related_tickers, ai_sentiment, event_key")
      .gte("published_at", yesterday)
      .gte("quality_version", 2).order("published_at", { ascending: false }).limit(500);
    data = res.data;
  } catch {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: active } = await supabase.from("stocks").select("ticker").eq("is_active", true);
  const activeSet = new Set((active ?? []).map((s: {ticker: string}) => s.ticker));
  const counted = new Set<string>();
  // Count distinct stories per active issuer, folding Alphabet share classes.
  const map = new Map<string, { count: number; pos: number; neg: number }>();
  for (const row of data ?? []) {
    for (const ticker of new Set((row.related_tickers ?? []).filter(t => activeSet.has(t)).map(t => t === "GOOGL" ? "GOOG" : t))) {
      const key = `${ticker}:${row.event_key ?? row.id}`;
      if (counted.has(key)) continue;
      counted.add(key);
      const entry = map.get(ticker) ?? { count: 0, pos: 0, neg: 0 };
      entry.count++;
      if (row.ai_sentiment === "positive") entry.pos++;
      if (row.ai_sentiment === "negative") entry.neg++;
      map.set(ticker, entry);
    }
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
              className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors hover:bg-[var(--surface-2)]"
              style={{ color: "var(--text-2)" }}
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
                {count} stor{count !== 1 ? "ies" : "y"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
