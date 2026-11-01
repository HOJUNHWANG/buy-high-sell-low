import { getLatestPublicNews } from "@/lib/cached-data";
import { getNewsAccess } from "@/lib/news-access";
import type { NewsArticle } from "@/lib/types";
import type { Metadata } from "next";
import { Suspense } from "react";
import { diversifyNews } from "@/lib/news-quality";
import { NewsFilter } from "@/components/NewsFilter";
import { TrendingTickersWidget } from "@/components/TrendingTickersWidget";
import { SentimentWidget } from "@/components/SentimentWidget";

import { gateSummaries } from "@/lib/summary-gate";

export const metadata: Metadata = {
  title: "News Feed",
  description: "Latest US stock market news with AI analysis and sentiment filter.",
};

type Sentiment = "all" | "positive" | "neutral" | "negative";

async function getNews(): Promise<NewsArticle[]> {
  try {
    const data = await getLatestPublicNews();
    return diversifyNews(data ?? [], 60);
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

  const [rawNews, { user, tier, unlockedIds, remainingUnlocks }] = await Promise.all([
    getNews(), getNewsAccess(),
  ]);
  const news = gateSummaries(rawNews, tier, unlockedIds);

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
          <div className="page-header flex items-center justify-between mb-5">
            <div>
              <p className="page-kicker mb-2">Signal desk</p>
              <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                News Feed
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                Updated hourly · {news.length} articles
              </p>
            </div>
          </div>

          <NewsFilter
            articles={news}
            initialTab={initialTab}
            isLoggedIn={!!user}
            initialRemainingUnlocks={remainingUnlocks}
          />
        </div>

      </div>
    </div>
  );
}
