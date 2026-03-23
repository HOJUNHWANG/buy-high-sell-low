"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { NewsArticle } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { SentimentBadge } from "@/components/SentimentBadge";
import { AdSlot } from "@/components/AdSlot";
import { LockedSummary } from "@/components/LockedSummary";
import { useAdBlocked } from "@/components/AdBlockDetector";
import { TickerBadge } from "@/components/TickerBadge";

type Tab = "all" | "positive" | "neutral" | "negative";

export function NewsFilter({
  articles,
  initialTab = "all",
  isLoggedIn = false,
  initialRemainingUnlocks = 0,
  logoMap = {},
}: {
  articles: NewsArticle[];
  initialTab?: Tab;
  isLoggedIn?: boolean;
  initialRemainingUnlocks?: number;
  /** ticker → logo_url mapping for TickerBadge icons */
  logoMap?: Record<string, string | null>;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const adBlocked = useAdBlocked();
  const [remaining, setRemaining] = useState(initialRemainingUnlocks);
  const [unlockedMap, setUnlockedMap] = useState<
    Record<number, { summary: string; insight: string | null; sentiment: string | null; caution: string | null }>
  >({});
  const router = useRouter();
  const pathname = usePathname();

  function handleTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams();
    if (next !== "all") params.set("sentiment", next);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  const tabs: { id: Tab; label: string; color?: string }[] = [
    { id: "all",      label: "All" },
    { id: "positive", label: "Positive", color: "var(--up)" },
    { id: "neutral",  label: "Neutral" },
    { id: "negative", label: "Negative", color: "var(--down)" },
  ];

  const AD_BLOCK_NEWS_LIMIT = 10;

  const filteredAll = tab === "all"
    ? articles
    : articles.filter((a) => {
        const unlocked = unlockedMap[a.id];
        const sentiment = unlocked?.sentiment ?? a.ai_sentiment;
        return sentiment === tab;
      });

  const filtered = adBlocked ? filteredAll.slice(0, AD_BLOCK_NEWS_LIMIT) : filteredAll;
  const hiddenByAdBlock = adBlocked ? Math.max(0, filteredAll.length - AD_BLOCK_NEWS_LIMIT) : 0;

  const counts: Record<Tab, number> = {
    all:      articles.length,
    positive: articles.filter((a) => (unlockedMap[a.id]?.sentiment ?? a.ai_sentiment) === "positive").length,
    neutral:  articles.filter((a) => (unlockedMap[a.id]?.sentiment ?? a.ai_sentiment) === "neutral").length,
    negative: articles.filter((a) => (unlockedMap[a.id]?.sentiment ?? a.ai_sentiment) === "negative").length,
  };

  return (
    <>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {tabs.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => handleTab(id)}
            className={`filter-tab${tab === id ? " active" : ""}`}
          >
            <span style={tab === id && color ? { color } : undefined}>{label}</span>
            <span
              className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: tab === id ? "var(--surface)" : "var(--surface-2)",
                color: "var(--text-3)",
              }}
            >
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      {/* Articles */}
      {filtered.length === 0 ? (
        <div
          className="rounded-xl px-5 py-12 text-sm text-center"
          style={{ border: "1px dashed var(--border-md)", color: "var(--text-2)" }}
        >
          {tab === "all"
            ? "No news yet — collection runs every hour."
            : `No ${tab} sentiment articles found.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((article, idx) => {
            const unlocked = unlockedMap[article.id];
            const displaySummary = unlocked?.summary ?? article.ai_summary;
            const displayInsight = unlocked?.insight ?? article.ai_insight;
            const displaySentiment = unlocked?.sentiment ?? article.ai_sentiment;
            const isLocked = article.summaryLocked && !unlocked;

            const sc = displaySentiment;
            const barColor =
              sc === "positive" ? "var(--up)" : sc === "negative" ? "var(--down)" : "var(--border-md)";

            return (
              <div key={article.id}>
              {idx > 0 && idx % 5 === 0 && (
                <AdSlot slot="news-feed" format="horizontal" className="my-2" />
              )}
              <article className="card rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-0.5 self-stretch rounded-full shrink-0"
                    style={{ background: barColor }}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Meta */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {article.ticker && (
                        <TickerBadge ticker={article.ticker} logoUrl={logoMap[article.ticker]} />
                      )}
                      {article.related_tickers?.filter((t) => t !== article.ticker).map((t) => (
                        <TickerBadge key={t} ticker={t} logoUrl={logoMap[t]} />
                      ))}
                      {article.source && (
                        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                          {article.source}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                        {timeAgo(article.published_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium leading-snug external-link"
                      style={{ color: "var(--text)" }}
                    >
                      {article.title}
                    </a>

                    {/* AI Summary — locked / unlocked / pending */}
                    {isLocked ? (
                      <LockedSummary
                        articleId={article.id}
                        isLoggedIn={isLoggedIn}
                        remainingUnlocks={remaining}
                        adBlocked={adBlocked}
                        onUnlock={(data) => {
                          setUnlockedMap((prev) => ({ ...prev, [article.id]: data }));
                          setRemaining((r) => Math.max(0, r - 1));
                        }}
                      />
                    ) : displaySummary ? (
                      <div
                        className="rounded-lg p-3 space-y-1.5"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                          >
                            AI
                          </span>
                          <SentimentBadge sentiment={sc} />
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                          {displaySummary}
                        </p>
                        {displayInsight && (
                          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                            Impact: {displayInsight}
                          </p>
                        )}
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                          Not investment advice
                        </p>
                      </div>
                    ) : (
                      <div
                        className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px dashed var(--border-md)",
                          color: "var(--text-3)",
                        }}
                      >
                        <span className="animate-spin" style={{ display: "inline-block" }}>&#x23F3;</span>
                        <span>Generating AI summary...</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
              </div>
            );
          })}

          {/* Ad blocker limit notice */}
          {hiddenByAdBlock > 0 && (
            <div
              className="rounded-xl px-5 py-6 text-center mt-3"
              style={{ border: "1px dashed var(--border-md)" }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-2"
                style={{ color: "var(--text-3)" }}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>
                {hiddenByAdBlock} more article{hiddenByAdBlock > 1 ? "s" : ""} hidden
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                Disable your ad blocker to see the full news feed
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
