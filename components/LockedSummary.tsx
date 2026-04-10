"use client";

import { useState } from "react";
import Link from "next/link";
import { SentimentBadge } from "@/components/SentimentBadge";

interface LockedSummaryProps {
  articleId: number;
  isLoggedIn: boolean;
  remainingUnlocks: number;
  onUnlock?: (data: {
    summary: string;
    insight: string | null;
    sentiment: string | null;
    caution: string | null;
  }) => void;
}

export function LockedSummary({
  articleId,
  isLoggedIn,
  remainingUnlocks,
  onUnlock,
}: LockedSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    if (remainingUnlocks <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to unlock");
        return;
      }
      const data = await res.json();
      onUnlock?.(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-lg p-3 relative overflow-hidden"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Blurred placeholder text */}
      <div className="select-none pointer-events-none" style={{ filter: "blur(6px)" }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
          >
            AI
          </span>
          <SentimentBadge sentiment={null} />
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          This article discusses significant market movements and their potential
          impact on investor sentiment across multiple sectors.
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
          Impact: May affect short-term trading patterns.
        </p>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface-2)]/70 backdrop-blur-[1px]">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--text-3)" }}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        {!isLoggedIn ? (
          <>
            <p className="text-[11px] font-medium" style={{ color: "var(--text-2)" }}>
              AI summary locked
            </p>
            <Link
              href="/auth/login"
              className="btn btn-primary"
              style={{ fontSize: "11px", padding: "4px 12px" }}
            >
              Sign up free to unlock
            </Link>
          </>
        ) : remainingUnlocks <= 0 ? (
          <p className="text-[11px] font-medium text-center px-3" style={{ color: "var(--text-2)" }}>
            Daily limit reached — resets tomorrow
          </p>
        ) : (
          <>
            {error && (
              <p className="text-[10px]" style={{ color: "var(--down)" }}>{error}</p>
            )}
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="btn btn-primary"
              style={{ fontSize: "11px", padding: "4px 12px" }}
            >
              {loading ? "Unlocking..." : `Unlock (${remainingUnlocks} left today)`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
