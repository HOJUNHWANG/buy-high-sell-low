"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalCount: number;
  page: number;
  totalPages: number;
}

const REFRESH_INTERVAL = 30_000;
const COLORS = ["#7c6cfc", "#4ade80", "#f87171", "#fbbf24", "#38bdf8", "#c084fc", "#fb7185", "#34d399"];

export default function LeaderboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, [supabase]);

  const fetchLeaderboard = useCallback(async (p: number, isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch(`/api/paper/leaderboard?page=${p}`);
      const json = await res.json();
      setData(json);
    } catch {
      // silent fail on background refresh
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(page);
    intervalRef.current = setInterval(() => fetchLeaderboard(page, true), REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [page, fetchLeaderboard]);

  function goToPage(p: number) {
    setPage(p);
    setExpandedRow(null);
  }

  // Page numbers to show
  function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (current > 3) pages.push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
  }

  const myRank = data?.myRank ?? null;
  const isMyRankOnPage = data?.entries.some(e => e.userId === currentUserId) ?? false;

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-5 fade-up">
      <PaperTradeBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Leaderboard</h1>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
            Live · updates every 30s
            <span className="inline-block w-1.5 h-1.5 rounded-full ml-1.5 animate-pulse"
              style={{ background: "var(--up)", verticalAlign: "middle" }} />
          </p>
        </div>
        <Link href="/paper" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          Portfolio
        </Link>
      </div>

      {/* My Rank Card — pinned at top */}
      {myRank && !loading && (
        <div className="rounded-xl p-4" style={{
          background: "linear-gradient(135deg, rgba(124,108,252,0.1), rgba(74,222,128,0.08))",
          border: "1px solid rgba(124,108,252,0.25)",
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: myRank.rank <= 3 ? "rgba(251,191,36,0.15)" : "var(--surface-3)",
                  color: myRank.rank <= 3 ? "#fbbf24" : "var(--text)",
                  border: "1px solid var(--border)",
                }}>
                {myRank.rank <= 3 ? ["", "🥇", "🥈", "🥉"][myRank.rank] : `#${myRank.rank}`}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--accent)" }}>Your Rank</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  #{myRank.rank}
                  <span className="text-xs font-normal ml-1.5" style={{ color: "var(--text-3)" }}>
                    of {data?.totalCount ?? 0}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                ${myRank.totalValue.toFixed(2)}
              </p>
              <p className="text-xs font-semibold tabular-nums"
                style={{ color: myRank.returnPct >= 0 ? "var(--up)" : "var(--down)" }}>
                {myRank.returnPct >= 0 ? "+" : ""}{myRank.returnPct.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Mini portfolio */}
          {myRank.positions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {myRank.positions.slice(0, 6).map((p) => (
                <span key={`${p.ticker}-${p.side}`} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                  {p.ticker} {p.allocationPct.toFixed(0)}%
                  {p.side === "short" && <span style={{ color: "#f97316" }}> S</span>}
                  {p.leverage > 1 && <span style={{ color: "var(--accent)" }}> {p.leverage}x</span>}
                </span>
              ))}
              {myRank.positions.length > 6 && (
                <span className="text-[10px] px-1.5 py-0.5" style={{ color: "var(--text-3)" }}>
                  +{myRank.positions.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--border)" }}>
          {["#", "Trader", "Value", "Return"].map((h) => (
            <span key={h} className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-3)" }}>{h}</span>
          ))}
          <span className="text-[10px] font-semibold uppercase tracking-widest hidden sm:block"
            style={{ color: "var(--text-3)" }}>Pos</span>
        </div>

        {/* Skeleton */}
        {loading && !data && (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {Array.from({ length: 10 }).map((_, i) => (
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
        {!loading && data && data.entries.length === 0 && (
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
        {data?.entries.map((e) => {
          const isMe = currentUserId !== null && e.userId === currentUserId;
          return (
            <div key={e.rank}>
              <button
                onClick={() => setExpandedRow(expandedRow === e.rank ? null : e.rank)}
                className="w-full grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-3 text-left transition-colors"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: isMe
                    ? "rgba(124,108,252,0.06)"
                    : expandedRow === e.rank ? "var(--surface-2)" : "transparent",
                }}
              >
                {/* Rank */}
                <span className="text-sm font-bold" style={{ color: e.rank <= 3 ? "#fbbf24" : "var(--text)" }}>
                  {e.rank <= 3 ? ["", "🥇", "🥈", "🥉"][e.rank] : `#${e.rank}`}
                </span>

                {/* Trader name + ME badge */}
                <span className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: isMe ? "var(--accent)" : "var(--text-2)" }}>
                    {isMe ? "You" : `Trader_${e.userId.slice(0, 6)}`}
                  </span>
                  {isMe && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                      style={{
                        background: "rgba(124,108,252,0.2)",
                        color: "var(--accent)",
                        border: "1px solid rgba(124,108,252,0.3)",
                      }}>
                      ME
                    </span>
                  )}
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
                        style={{ color: "var(--text-3)" }}>Portfolio Breakdown</p>
                      <div className="flex flex-wrap gap-1.5">
                        {e.positions.map((p) => (
                          <div key={`${p.ticker}-${p.side}`}
                            className="flex items-center gap-1 rounded-md px-2 py-1"
                            style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
                            <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                              {p.ticker}
                            </span>
                            <span className="text-[10px] tabular-nums" style={{ color: "var(--text-2)" }}>
                              {p.allocationPct.toFixed(1)}%
                            </span>
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                              style={{
                                background: p.side === "short" ? "rgba(249,115,22,0.15)" : "rgba(74,222,128,0.15)",
                                color: p.side === "short" ? "#f97316" : "var(--up)",
                              }}>
                              {p.side === "short" ? "SHORT" : "LONG"}
                            </span>
                            {p.leverage > 1 && (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                                {p.leverage}x
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden flex mt-2"
                        style={{ background: "var(--surface-3)" }}>
                        {e.positions.map((p, i) => (
                          <div key={`${p.ticker}-${p.side}-bar`}
                            style={{
                              width: `${p.allocationPct}%`,
                              background: COLORS[i % COLORS.length],
                              minWidth: p.allocationPct > 0 ? "2px" : "0",
                            }}
                            title={`${p.ticker}: ${p.allocationPct.toFixed(1)}%`} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--surface-2)",
              color: page <= 1 ? "var(--text-3)" : "var(--text)",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.5 : 1,
            }}>
            ←
          </button>
          {getPageNumbers(page, data.totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="text-xs px-1" style={{ color: "var(--text-3)" }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => goToPage(p as number)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: p === page ? "var(--accent)" : "var(--surface-2)",
                  color: p === page ? "#fff" : "var(--text-2)",
                }}>
                {p}
              </button>
            )
          )}
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= data.totalPages}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: "var(--surface-2)",
              color: page >= data.totalPages ? "var(--text-3)" : "var(--text)",
              cursor: page >= data.totalPages ? "not-allowed" : "pointer",
              opacity: page >= data.totalPages ? 0.5 : 1,
            }}>
            →
          </button>
        </div>
      )}

      {/* Footer info */}
      {data && (
        <p className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>
          Showing {((data.page - 1) * 20) + 1}–{Math.min(data.page * 20, data.totalCount)} of {data.totalCount} traders
          {!isMyRankOnPage && myRank && ` · Your rank: #${myRank.rank}`}
        </p>
      )}
    </div>
  );
}
