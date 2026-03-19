"use client";

import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import Link from "next/link";

type Tab = "all" | "positive" | "neutral" | "negative";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const color = sentiment === "positive" ? "var(--up)" : sentiment === "negative" ? "var(--down)" : "var(--text-3)";
  const bg    = sentiment === "positive" ? "var(--up-dim)" : sentiment === "negative" ? "var(--down-dim)" : "var(--surface-3)";
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: bg, color }}>
      {sentiment}
    </span>
  );
}

export function NewsFilter({ articles }: { articles: NewsArticle[] }) {
  const [tab, setTab] = useState<Tab>("all");

  const tabs: { id: Tab; label: string; color?: string }[] = [
    { id: "all",      label: "All" },
    { id: "positive", label: "Positive", color: "var(--up)" },
    { id: "neutral",  label: "Neutral" },
    { id: "negative", label: "Negative", color: "var(--down)" },
  ];

  const filtered = tab === "all"
    ? articles
    : articles.filter((a) => a.ai_sentiment === tab);

  const counts: Record<Tab, number> = {
    all:      articles.length,
    positive: articles.filter((a) => a.ai_sentiment === "positive").length,
    neutral:  articles.filter((a) => a.ai_sentiment === "neutral").length,
    negative: articles.filter((a) => a.ai_sentiment === "negative").length,
  };

  return (
    <>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {tabs.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
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
          {filtered.map((article) => {
            const sc = article.ai_sentiment;
            const barColor =
              sc === "positive" ? "var(--up)" : sc === "negative" ? "var(--down)" : "var(--border-md)";

            return (
              <article
                key={article.id}
                className="card rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-0.5 self-stretch rounded-full shrink-0"
                    style={{ background: barColor }}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {article.ticker && (
                        <Link
                          href={`/stock/${article.ticker}`}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                        >
                          {article.ticker}
                        </Link>
                      )}
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

                    {/* AI Summary */}
                    {article.ai_summary ? (
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
                          {article.ai_summary}
                        </p>
                        {article.ai_insight && (
                          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                            Impact: {article.ai_insight}
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
                        <span>⏳</span>
                        <span>AI summary pending</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
