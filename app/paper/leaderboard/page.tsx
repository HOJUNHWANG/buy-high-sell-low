"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  totalValue: number;
  returnPct: number;
  positionCount: number;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/paper/leaderboard")
      .then((r) => r.json())
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-5 fade-up">
      <PaperTradeBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Leaderboard</h1>
        <Link href="/paper" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          Portfolio
        </Link>
      </div>

      {/* Coming Soon overlay */}
      <div className="relative">
        {/* Blurred content behind */}
        <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}>
          <div className="card rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Rank", "Trader", "Portfolio Value", "Return", "Positions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-3)", fontSize: "10px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loading ? Array.from({ length: 10 }, (_, i) => ({
                  rank: i + 1,
                  userId: "xxxxxxxx",
                  totalValue: 1000 + Math.random() * 4000,
                  returnPct: (Math.random() - 0.3) * 200,
                  positionCount: Math.floor(Math.random() * 8),
                })) : entries).map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-bold" style={{ color: e.rank <= 3 ? "#fbbf24" : "var(--text)" }}>
                      {e.rank <= 3 ? ["", "\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"][e.rank] : `#${e.rank}`}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>
                      Trader_{e.userId.slice(0, 6)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: "var(--text)" }}>
                      ${e.totalValue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold"
                      style={{ color: e.returnPct >= 0 ? "var(--up)" : "var(--down)" }}>
                      {e.returnPct >= 0 ? "+" : ""}{e.returnPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-2)" }}>
                      {e.positionCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl"
          style={{ background: "rgba(8,8,8,0.7)", backdropFilter: "blur(2px)" }}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-3)", border: "1px solid var(--border-md)" }}>
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
                style={{ color: "var(--text-3)" }}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>Coming Soon</h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>
                The leaderboard is being prepared. Stay tuned!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
