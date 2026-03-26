"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";

interface PositionInfo {
  ticker: string;
  side: string;
  leverage: number;
  allocationPct: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  totalValue: number;
  returnPct: number;
  positionCount: number;
  positions: PositionInfo[];
}

const REFRESH_INTERVAL = 30_000; // 30 seconds

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLeaderboard(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch("/api/paper/leaderboard");
      const data = await res.json();
      setEntries(data);
      setLastUpdate(new Date());
    } catch {
      // silent fail on background refresh
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeaderboard();
    intervalRef.current = setInterval(() => fetchLeaderboard(true), REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-5 fade-up">
      <PaperTradeBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Leaderboard</h1>
          {lastUpdate && (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
              Live · updates every 30s
              <span className="inline-block w-1.5 h-1.5 rounded-full ml-1.5 animate-pulse"
                style={{ background: "var(--up)", verticalAlign: "middle" }} />
            </p>
          )}
        </div>
        <Link href="/paper" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          Portfolio
        </Link>
      </div>

      <div className="card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--border)" }}>
          {["#", "Trader", "Value", "Return"].map((h) => (
            <span key={h} className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-3)" }}>
              {h}
            </span>
          ))}
          <span className="text-[10px] font-semibold uppercase tracking-widest hidden sm:block"
            style={{ color: "var(--text-3)" }}>
            Pos
          </span>
        </div>

        {/* Skeleton */}
        {loading && entries.length === 0 && (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-3">
                <div className="skeleton h-4 w-6 rounded" />
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-4 w-16 rounded" />
                <div className="skeleton h-4 w-14 rounded" />
                <div className="skeleton h-4 w-6 rounded hidden sm:block" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && entries.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              No traders yet. Be the first to trade!
            </p>
            <Link href="/stocks" className="btn btn-primary btn-sm mt-3 inline-flex">
              Start Trading
            </Link>
          </div>
        )}

        {/* Rows */}
        {entries.map((e) => (
          <div key={e.rank}>
            <button
              onClick={() => setExpandedRow(expandedRow === e.rank ? null : e.rank)}
              className="w-full grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-3 text-left transition-colors"
              style={{
                borderBottom: "1px solid var(--border)",
                background: expandedRow === e.rank ? "var(--surface-2)" : "transparent",
              }}
            >
              {/* Rank */}
              <span className="text-sm font-bold" style={{ color: e.rank <= 3 ? "#fbbf24" : "var(--text)" }}>
                {e.rank <= 3 ? ["", "🥇", "🥈", "🥉"][e.rank] : `#${e.rank}`}
              </span>

              {/* Trader name */}
              <span className="text-xs" style={{ color: "var(--text-2)" }}>
                Trader_{e.userId.slice(0, 6)}
              </span>

              {/* Value */}
              <span className="text-xs tabular-nums font-semibold" style={{ color: "var(--text)" }}>
                ${e.totalValue.toFixed(2)}
              </span>

              {/* Return */}
              <span className="text-xs tabular-nums font-semibold"
                style={{ color: e.returnPct >= 0 ? "var(--up)" : "var(--down)" }}>
                {e.returnPct >= 0 ? "+" : ""}{e.returnPct.toFixed(2)}%
              </span>

              {/* Position count */}
              <span className="text-xs tabular-nums hidden sm:block" style={{ color: "var(--text-2)" }}>
                {e.positionCount}
              </span>
            </button>

            {/* Expanded: Position Portfolio */}
            {expandedRow === e.rank && (
              <div className="px-4 py-3 space-y-2"
                style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                {e.positions.length === 0 ? (
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    No open positions — cash only
                  </p>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-3)" }}>
                      Portfolio Breakdown
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.positions.map((p) => (
                        <div key={`${p.ticker}-${p.side}`}
                          className="flex items-center gap-1 rounded-md px-2 py-1"
                          style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
                          {/* Ticker + allocation */}
                          <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                            {p.ticker}
                          </span>
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-2)" }}>
                            {p.allocationPct.toFixed(1)}%
                          </span>

                          {/* LONG / SHORT badge */}
                          <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                            style={{
                              background: p.side === "short"
                                ? "rgba(249,115,22,0.15)"
                                : "rgba(74,222,128,0.15)",
                              color: p.side === "short" ? "#f97316" : "var(--up)",
                            }}>
                            {p.side === "short" ? "SHORT" : "LONG"}
                          </span>

                          {/* Leverage badge */}
                          {p.leverage > 1 && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                              {p.leverage}x
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Allocation bar */}
                    <div className="h-1.5 rounded-full overflow-hidden flex mt-2"
                      style={{ background: "var(--surface-3)" }}>
                      {e.positions.map((p, i) => (
                        <div
                          key={`${p.ticker}-${p.side}-bar`}
                          style={{
                            width: `${p.allocationPct}%`,
                            background: COLORS[i % COLORS.length],
                            minWidth: p.allocationPct > 0 ? "2px" : "0",
                          }}
                          title={`${p.ticker}: ${p.allocationPct.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const COLORS = ["#7c6cfc", "#4ade80", "#f87171", "#fbbf24", "#38bdf8", "#c084fc", "#fb7185", "#34d399"];
