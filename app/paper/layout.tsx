"use client";

import { useAdBlocked } from "@/components/AdBlockDetector";
import Link from "next/link";

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  const adBlocked = useAdBlocked();

  if (adBlocked) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center fade-up">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-4"
          style={{ color: "var(--text-3)" }}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Paper Trading Locked
        </h1>
        <p className="text-sm mb-1" style={{ color: "var(--text-2)" }}>
          Paper trading requires ads to stay free.
        </p>
        <p className="text-xs mb-6" style={{ color: "var(--text-3)" }}>
          Please disable your ad blocker and refresh to access paper trading,
          portfolio, leaderboard, and trade history.
        </p>
        <Link href="/" className="btn btn-primary btn-sm">
          Back to Markets
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
