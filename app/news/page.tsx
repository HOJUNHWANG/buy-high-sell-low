import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle } from "@/lib/types";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsFilter } from "@/components/NewsFilter";
import { TrendingTickersWidget } from "@/components/TrendingTickersWidget";
import { SentimentWidget } from "@/components/SentimentWidget";
import { gateSummaries, FREE_USER_DAILY_UNLOCKS } from "@/lib/summary-gate";
import type { UserTier } from "@/lib/summary-gate";

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

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let tier: UserTier = "guest";
  let unlockedIds = new Set<number>();
  let remainingUnlocks = 0;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("tier")
      .eq("user_id", user.id)
      .single();
    tier = (profile?.tier as UserTier) ?? "free";

    // Fetch user's permanently unlocked articles
    const { data: unlocks } = await supabase
      .from("summary_unlocks")
      .select("article_id, unlocked_at")
      .eq("user_id", user.id);
    unlockedIds = new Set((unlocks ?? []).map((u: { article_id: number }) => u.article_id));

    // Calculate today's remaining unlocks (only for free tier)
    if (tier === "free") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = (unlocks ?? []).filter(
        (u: { unlocked_at: string }) => new Date(u.unlocked_at) >= todayStart,
      ).length;
      remainingUnlocks = Math.max(0, FREE_USER_DAILY_UNLOCKS - todayCount);
    }
  }

  const rawNews = await getNews();
  const news = gateSummaries(rawNews, tier, unlockedIds);

  // Collect all tickers from news and fetch their logos
  const tickerSet = new Set<string>();
  for (const a of news) {
    if (a.ticker) tickerSet.add(a.ticker);
  }
  let logoMap: Record<string, string | null> = {};
  if (tickerSet.size > 0) {
    const { data: logos } = await supabase
      .from("stocks")
      .select("ticker, logo_url")
      .in("ticker", [...tickerSet]);
    for (const s of logos ?? []) {
      logoMap[s.ticker] = s.logo_url;
    }
  }

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

          <NewsFilter
            articles={news}
            initialTab={initialTab}
            isLoggedIn={!!user}
            initialRemainingUnlocks={remainingUnlocks}
            logoMap={logoMap}
          />
        </div>

      </div>
    </div>
  );
}
