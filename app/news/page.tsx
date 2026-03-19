import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle } from "@/lib/types";
import { NewsFilter } from "@/components/NewsFilter";

export const metadata = {
  title: "News Feed",
  description: "Latest US stock market news with AI analysis and sentiment filter.",
};

async function getNews(): Promise<NewsArticle[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("news_articles")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(60);
  return data ?? [];
}

export default async function NewsPage() {
  const news = await getNews();

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            News Feed
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            Updated hourly · {news.length} articles
          </p>
        </div>
      </div>

      <NewsFilter articles={news} />
    </div>
  );
}
