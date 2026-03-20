import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle } from "@/lib/types";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsFilter } from "@/components/NewsFilter";
import { TrendingTickersWidget } from "@/components/TrendingTickersWidget";
import { SentimentWidget } from "@/components/SentimentWidget";

export const metadata: Metadata = {
  title: "News Feed",
  description: "Latest US stock market news with AI analysis and sentiment filter.",
};

type Sentiment = "all" | "positive" | "neutral" | "negative";

async function getNews(): Promise<NewsArticle[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("news_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(60);
    return data ?? [];
  } catch {
    return [];
  }
}

function WidgetSkeleton() {
  return (
    <div className="card rounded-xl p-3 space-y-2">
      <div className="skeleton h-3 w-24 rounded" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-4 rounded" />
      ))}
    </div>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ sentiment?: string }>;
}) {
  const { sentiment } = await searchParams;
  const validSentiments: Sentiment[] = ["all", "positive", "neutral", "negative"];
  const initialTab: Sentiment =
    validSentiments.includes(sentiment as Sentiment)
      ? (sentiment as Sentiment)
      : "all";

  const news = await getNews();

  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="flex gap-5 items-start">

        {/* ── Left sidebar ── */}
        <aside className="hidden lg:flex flex-col gap-4 w-48 shrink-0 sticky top-16">
          <Suspense fallback={<WidgetSkeleton />}>
            <TrendingTickersWidget />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <SentimentWidget />
          </Suspense>
        </aside>

        {/* ── Main news feed ── */}
        <div className="flex-1 min-w-0">
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

          <NewsFilter articles={news} initialTab={initialTab} />
        </div>

      </div>
    </div>
  );
}
