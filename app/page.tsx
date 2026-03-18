import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle, StockPrice, Stock } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

async function getTopMovers(): Promise<(StockPrice & { stocks: Stock })[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stock_prices")
    .select("*, stocks(*)")
    .not("change_pct", "is", null)
    .order("change_pct", { ascending: false })
    .limit(10);
  return (data as (StockPrice & { stocks: Stock })[]) ?? [];
}

async function getLatestNews(): Promise<NewsArticle[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("news_articles")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

function formatChangePct(pct: number | null) {
  if (pct === null) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function HomePage() {
  const [movers, news] = await Promise.all([getTopMovers(), getLatestNews()]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      {/* Today's Movers */}
      <section>
        <h2 className="text-lg font-semibold text-gray-300 mb-4">
          Today&apos;s Movers
        </h2>
        {movers.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Market data unavailable — check back during trading hours.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {movers.map((m) => {
              const pct = m.change_pct ?? 0;
              const isUp = pct >= 0;
              return (
                <Link
                  key={m.ticker}
                  href={`/stock/${m.ticker}`}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg px-3 py-2 transition-colors"
                >
                  {m.stocks?.logo_url && (
                    <Image
                      src={m.stocks.logo_url}
                      alt={m.ticker}
                      width={20}
                      height={20}
                      className="rounded-sm object-contain bg-white"
                    />
                  )}
                  <span className="font-medium text-sm">{m.ticker}</span>
                  <span
                    className={`text-sm font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {formatChangePct(m.change_pct)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Latest News */}
      <section>
        <h2 className="text-lg font-semibold text-gray-300 mb-4">
          Latest News
        </h2>
        <div className="space-y-4">
          {news.length === 0 ? (
            <p className="text-gray-500 text-sm">No news yet.</p>
          ) : (
            news.map((article) => (
              <article
                key={article.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {article.ticker && (
                    <Link
                      href={`/stock/${article.ticker}`}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      [{article.ticker}]
                    </Link>
                  )}
                  {article.source && <span>{article.source}</span>}
                  <span>{timeAgo(article.published_at)}</span>
                </div>

                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-medium text-gray-100 hover:text-white leading-snug"
                >
                  {article.title}
                </a>

                {article.ai_summary ? (
                  <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300 space-y-1">
                    <p>{article.ai_summary}</p>
                    {article.ai_sentiment && (
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          article.ai_sentiment === "positive"
                            ? "bg-emerald-900 text-emerald-300"
                            : article.ai_sentiment === "negative"
                            ? "bg-red-900 text-red-300"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {article.ai_sentiment}
                      </span>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      ⚠ Not investment advice.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-800/50 border border-gray-700 border-dashed rounded-lg px-3 py-2 text-sm text-gray-500">
                    🔒{" "}
                    <Link
                      href="/auth/login"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Sign up free
                    </Link>{" "}
                    to see AI Summary
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        {news.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href="/news"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View all news →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
