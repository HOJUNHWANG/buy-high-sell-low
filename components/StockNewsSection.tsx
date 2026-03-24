"use client";

import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { SentimentBadge } from "@/components/SentimentBadge";
import { LockedSummary } from "@/components/LockedSummary";
import { useAdBlocked } from "@/components/AdBlockDetector";
import { TickerBadge } from "@/components/TickerBadge";

interface StockNewsSectionProps {
  news: NewsArticle[];
  ticker: string;
  isLoggedIn: boolean;
  initialRemainingUnlocks: number;
  /** ticker → logo_url mapping for related ticker icons */
  logoMap?: Record<string, string | null>;
}

export function StockNewsSection({
  news,
  ticker,
  isLoggedIn,
  initialRemainingUnlocks,
  logoMap = {},
}: StockNewsSectionProps) {
  const adBlocked = useAdBlocked();
  const [remaining, setRemaining] = useState(initialRemainingUnlocks);
  const [unlockedMap, setUnlockedMap] = useState<
    Record<number, { summary: string; insight: string | null; sentiment: string | null; caution: string | null }>
  >({});

  return (
    <section>
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-3)" }}
      >
        Related News
      </p>

      {news.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-2)" }}>No news for {ticker}.</p>
      ) : (
        <div className="space-y-2">
          {news.map((article) => {
            const unlocked = unlockedMap[article.id];
            const displaySummary = unlocked?.summary ?? article.ai_summary;
            const displayInsight = unlocked?.insight ?? article.ai_insight;
            const displaySentiment = unlocked?.sentiment ?? article.ai_sentiment;
            const isLocked = article.summaryLocked && !unlocked;

            const sc = displaySentiment;
            const barClr =
              sc === "positive" ? "var(--up)" : sc === "negative" ? "var(--down)" : "var(--border-md)";

            return (
              <article key={article.id} className="card rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-0.5 self-stretch rounded-full shrink-0"
                    style={{ background: barClr }}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]" style={{ color: "var(--text-3)" }}>
                      {/* Show primary ticker if different from current page */}
                      {article.ticker && article.ticker !== ticker && (
                        <TickerBadge ticker={article.ticker} logoUrl={logoMap[article.ticker]} />
                      )}
                      {/* Show related tickers excluding current page's ticker */}
                      {article.related_tickers
                        ?.filter((t) => t !== ticker && t !== article.ticker)
                        .map((t) => (
                          <TickerBadge key={t} ticker={t} logoUrl={logoMap[t]} />
                        ))}
                      {article.source && <span>{article.source}</span>}
                      <span>{timeAgo(article.published_at)}</span>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium leading-snug external-link"
                      style={{ color: "var(--text)" }}
                    >
                      {article.title}
                    </a>

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
                        <div className="flex gap-1.5">
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
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
