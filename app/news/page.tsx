import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle } from "@/lib/types";
import Link from "next/link";

export const metadata = {
  title: "News Feed",
  description: "Latest US stock market news with AI analysis.",
};

async function getNews(page = 0): Promise<NewsArticle[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("news_articles")
    .select("*")
    .order("published_at", { ascending: false })
    .range(page * 20, page * 20 + 19);
  return data ?? [];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function NewsPage() {
  const news = await getNews(0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">News Feed</h1>

      {news.length === 0 ? (
        <p className="text-gray-500">No news yet. Data collection runs every hour.</p>
      ) : (
        <div className="space-y-4">
          {news.map((article, i) => (
            <>
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
                    <p className="text-xs text-gray-500">⚠ Not investment advice.</p>
                  </div>
                ) : (
                  <div className="bg-gray-800/50 border border-gray-700 border-dashed rounded-lg px-3 py-2 text-sm text-gray-500">
                    🔒{" "}
                    <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">
                      Sign up free
                    </Link>{" "}
                    to see AI Summary
                  </div>
                )}
              </article>

              {/* AdSense native ad placeholder every 5 articles */}
              {(i + 1) % 5 === 0 && (
                <div
                  key={`ad-${i}`}
                  className="border border-dashed border-gray-700 rounded-xl p-4 text-center text-xs text-gray-600"
                >
                  Advertisement
                </div>
              )}
            </>
          ))}
        </div>
      )}
    </div>
  );
}
