import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { SentimentBadge } from "@/components/SentimentBadge";
import { NewsEvidenceBadge } from "@/components/NewsEvidenceBadge";
import { NewsSummaryUnavailable } from "@/components/NewsSummaryUnavailable";

export function HomeNewsCard({
  article,
  isLoggedIn,
}: {
  article: NewsArticle;
  isLoggedIn: boolean;
}) {
  const sc = article.ai_sentiment;
  const barColor =
    sc === "positive" ? "var(--up)" :
    sc === "negative" ? "var(--down)" :
    "var(--border-md)";

  return (
    <article className="card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-0.5 self-stretch rounded-full shrink-0"
          style={{ background: barColor }}
        />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {article.source && (
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                {article.source}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {timeAgo(article.published_at)}
            </span>
            <NewsEvidenceBadge article={article} />
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

          {article.summaryLocked ? (
            /* Gated: blurred placeholder */
            <div
              className="rounded-lg p-3 relative overflow-hidden"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div className="select-none pointer-events-none" style={{ filter: "blur(6px)" }}>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                  This article discusses significant market movements and their potential
                  impact on investor sentiment across multiple sectors.
                </p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[var(--surface-2)]/70">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)" }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {isLoggedIn ? (
                  <Link href="/news" className="text-[11px] font-medium link-accent">
                    Unlock in News Feed
                  </Link>
                ) : (
                  <Link href="/auth/login" className="text-[11px] font-medium link-accent">
                    Sign up free to unlock
                  </Link>
                )}
              </div>
            </div>
          ) : article.ai_summary ? (
            <div
              className="rounded-lg p-3 space-y-1.5"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <NewsEvidenceBadge article={article} />
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
            <NewsSummaryUnavailable article={article} />
          )}
        </div>
      </div>
    </article>
  );
}
