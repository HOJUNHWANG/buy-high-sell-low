"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";

/* ── Types ── */
interface PositionInfo {
  ticker: string;
  side: string;
  leverage: number;
  allocationPct?: number;
  shares?: number;
  avg_cost?: number;
  borrowed?: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  totalValue: number;
  returnPct: number;
  positionCount: number;
  positions: PositionInfo[];
}

interface GraveyardEntry {
  rank: number;
  userId: string;
  finalValue: number;
  cashAtDeath: number;
  positions: PositionInfo[];
  liquidatedAt: string;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalCount: number;
  page: number;
  totalPages: number;
}

interface GraveyardResponse {
  entries: GraveyardEntry[];
  totalCount: number;
  page: number;
  totalPages: number;
  month: string;
}

type Reactions = Record<string, Record<string, number>>;
type MyReactions = Record<string, string[]>;

const REFRESH_INTERVAL = 30_000;
const COLORS = ["#7c6cfc", "#4ade80", "#f87171", "#fbbf24", "#38bdf8", "#c084fc", "#fb7185", "#34d399"];
const EMOJIS = ["🔥", "💀", "🤡", "📈", "😂", "🫡"];

export default function LeaderboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [tab, setTab] = useState<"leaderboard" | "graveyard">("leaderboard");
  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null);
  const [gyData, setGyData] = useState<GraveyardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reactions>({});
  const [myReactions, setMyReactions] = useState<MyReactions>({});
  const [remaining, setRemaining] = useState(5);
  const [emojiPicker, setEmojiPicker] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, [supabase]);

  /* ── Fetch Leaderboard ── */
  const fetchLeaderboard = useCallback(async (p: number, bg = false) => {
    if (!bg) setLoading(true);
    try {
      const res = await fetch(`/api/paper/leaderboard?page=${p}`);
      const json = await res.json();
      setLbData(json);
      // Fetch reactions for entries on this page
      const targets = (json.entries ?? []).map((e: LeaderboardEntry) => e.userId).join(",");
      if (targets) {
        const rr = await fetch(`/api/paper/leaderboard/react?targets=${targets}&tab=leaderboard`);
        const rd = await rr.json();
        setReactions(rd.reactions ?? {});
        setMyReactions(rd.myReactions ?? {});
        setRemaining(rd.remaining ?? 5);
      }
    } catch { /* silent */ }
    finally { if (!bg) setLoading(false); }
  }, []);

  /* ── Fetch Graveyard ── */
  const fetchGraveyard = useCallback(async (p: number, bg = false) => {
    if (!bg) setLoading(true);
    try {
      const res = await fetch(`/api/paper/leaderboard/graveyard?page=${p}`);
      const json = await res.json();
      setGyData(json);
      const targets = (json.entries ?? []).map((e: GraveyardEntry) => e.userId).join(",");
      if (targets) {
        const rr = await fetch(`/api/paper/leaderboard/react?targets=${targets}&tab=graveyard`);
        const rd = await rr.json();
        setReactions(rd.reactions ?? {});
        setMyReactions(rd.myReactions ?? {});
        setRemaining(rd.remaining ?? 5);
      }
    } catch { /* silent */ }
    finally { if (!bg) setLoading(false); }
  }, []);

  useEffect(() => {
    setPage(1);
    setExpandedRow(null);
    setEmojiPicker(null);
  }, [tab]);

  useEffect(() => {
    const fetcher = tab === "leaderboard" ? fetchLeaderboard : fetchGraveyard;
    fetcher(page);
    intervalRef.current = setInterval(() => fetcher(page, true), REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [page, tab, fetchLeaderboard, fetchGraveyard]);

  function goToPage(p: number) { setPage(p); setExpandedRow(null); setEmojiPicker(null); }

  /* ── React ── */
  async function toggleReaction(targetId: string, emoji: string) {
    const alreadyReacted = (myReactions[targetId] ?? []).includes(emoji);
    const res = await fetch("/api/paper/leaderboard/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetId,
        emoji,
        tab,
        action: alreadyReacted ? "remove" : "add",
      }),
    });
    if (res.ok) {
      // Optimistic update
      setReactions(prev => {
        const updated = { ...prev };
        if (!updated[targetId]) updated[targetId] = {};
        const cur = updated[targetId][emoji] ?? 0;
        updated[targetId] = { ...updated[targetId], [emoji]: alreadyReacted ? Math.max(0, cur - 1) : cur + 1 };
        if (updated[targetId][emoji] <= 0) delete updated[targetId][emoji];
        return updated;
      });
      setMyReactions(prev => {
        const updated = { ...prev };
        const list = updated[targetId] ?? [];
        updated[targetId] = alreadyReacted ? list.filter(e => e !== emoji) : [...list, emoji];
        return updated;
      });
      if (!alreadyReacted) setRemaining(r => Math.max(0, r - 1));
      else setRemaining(r => r + 1);
    }
    setEmojiPicker(null);
  }

  /* ── Pagination helper ── */
  function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (current > 3) pages.push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
  }

  const data = tab === "leaderboard" ? lbData : gyData;
  const totalPages = tab === "leaderboard" ? (lbData?.totalPages ?? 1) : (gyData?.totalPages ?? 1);
  const totalCount = tab === "leaderboard" ? (lbData?.totalCount ?? 0) : (gyData?.totalCount ?? 0);
  const myRank = tab === "leaderboard" ? (lbData?.myRank ?? null) : null;

  /* ── Reaction bar component ── */
  function ReactionBar({ targetId }: { targetId: string }) {
    if (targetId === currentUserId) return null;
    const targetReactions = reactions[targetId] ?? {};
    const hasReactions = Object.keys(targetReactions).length > 0;

    return (
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {/* Existing reactions */}
        {Object.entries(targetReactions).map(([emoji, count]) => {
          const isMine = (myReactions[targetId] ?? []).includes(emoji);
          return (
            <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(targetId, emoji); }}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-all"
              style={{
                background: isMine ? "rgba(124,108,252,0.15)" : "var(--surface-3)",
                border: isMine ? "1px solid rgba(124,108,252,0.3)" : "1px solid var(--border)",
              }}>
              <span>{emoji}</span>
              <span className="tabular-nums" style={{ color: "var(--text-2)", fontSize: "10px" }}>{count}</span>
            </button>
          );
        })}
        {/* Add reaction button */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setEmojiPicker(emojiPicker === targetId ? null : targetId); }}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-colors"
            style={{ background: hasReactions ? "transparent" : "var(--surface-3)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            title={remaining > 0 ? `Add reaction (${remaining} left today)` : "Daily limit reached"}>
            +
          </button>
          {emojiPicker === targetId && (
            <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1.5 rounded-lg z-10 shadow-lg"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {EMOJIS.map(em => {
                const alreadyUsed = (myReactions[targetId] ?? []).includes(em);
                return (
                  <button key={em} onClick={(e) => { e.stopPropagation(); toggleReaction(targetId, em); }}
                    className="w-7 h-7 rounded flex items-center justify-center text-sm hover:scale-110 transition-transform"
                    disabled={remaining <= 0 && !alreadyUsed}
                    style={{
                      background: alreadyUsed ? "rgba(124,108,252,0.15)" : "transparent",
                      opacity: remaining <= 0 && !alreadyUsed ? 0.3 : 1,
                    }}>
                    {em}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Position chips ── */
  function PositionChips({ positions }: { positions: PositionInfo[] }) {
    if (positions.length === 0) return (
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>No open positions — cash only</p>
    );
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          Portfolio Breakdown
        </p>
        <div className="flex flex-wrap gap-1.5">
          {positions.map((p) => (
            <div key={`${p.ticker}-${p.side}`}
              className="flex items-center gap-1 rounded-md px-2 py-1"
              style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
              <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{p.ticker}</span>
              {p.allocationPct != null && (
                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-2)" }}>
                  {p.allocationPct.toFixed(1)}%
                </span>
              )}
              <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none" style={{
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
        {positions.some(p => p.allocationPct != null) && (
          <div className="h-1.5 rounded-full overflow-hidden flex mt-2" style={{ background: "var(--surface-3)" }}>
            {positions.map((p, i) => (
              <div key={`${p.ticker}-${p.side}-bar`} style={{
                width: `${p.allocationPct ?? 0}%`, background: COLORS[i % COLORS.length],
                minWidth: (p.allocationPct ?? 0) > 0 ? "2px" : "0",
              }} title={`${p.ticker}: ${(p.allocationPct ?? 0).toFixed(1)}%`} />
            ))}
          </div>
        )}
      </>
    );
  }

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
        <Link href="/paper" className="text-xs font-medium" style={{ color: "var(--accent)" }}>Portfolio</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--surface-2)" }}>
        {([["leaderboard", "🏆 Leaderboard"], ["graveyard", "💀 Graveyard"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 px-4 py-2 rounded-md text-xs font-semibold transition-all"
            style={{
              background: tab === key ? "var(--surface)" : "transparent",
              color: tab === key ? "var(--text)" : "var(--text-3)",
              boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* My Rank Card — leaderboard tab only */}
      {tab === "leaderboard" && myRank && !loading && (
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
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>Your Rank</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  #{myRank.rank}
                  <span className="text-xs font-normal ml-1.5" style={{ color: "var(--text-3)" }}>of {lbData?.totalCount ?? 0}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>${myRank.totalValue.toFixed(2)}</p>
              <p className="text-xs font-semibold tabular-nums"
                style={{ color: myRank.returnPct >= 0 ? "var(--up)" : "var(--down)" }}>
                {myRank.returnPct >= 0 ? "+" : ""}{myRank.returnPct.toFixed(2)}%
              </p>
            </div>
          </div>
          {myRank.positions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {myRank.positions.slice(0, 6).map((p) => (
                <span key={`${p.ticker}-${p.side}`} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                  {p.ticker} {(p.allocationPct ?? 0).toFixed(0)}%
                  {p.side === "short" && <span style={{ color: "#f97316" }}> S</span>}
                  {p.leverage > 1 && <span style={{ color: "var(--accent)" }}> {p.leverage}x</span>}
                </span>
              ))}
              {myRank.positions.length > 6 && (
                <span className="text-[10px] px-1.5 py-0.5" style={{ color: "var(--text-3)" }}>+{myRank.positions.length - 6} more</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card rounded-xl overflow-hidden">
        {/* Header */}
        {tab === "leaderboard" ? (
          <div className="grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-center px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--border)" }}>
            {["#", "Trader", "Value", "Return"].map(h =>
              <span key={h} className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{h}</span>
            )}
            <span className="text-[10px] font-semibold uppercase tracking-widest hidden sm:block" style={{ color: "var(--text-3)" }}>Pos</span>
          </div>
        ) : (
          <div className="grid grid-cols-[48px_1fr_110px_120px] items-center px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--border)" }}>
            {["#", "Trader", "Final Value", "Liquidated"].map(h =>
              <span key={h} className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{h}</span>
            )}
          </div>
        )}

        {/* Skeleton */}
        {loading && !data && (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[48px_1fr_110px_90px] items-center px-4 py-3">
                <div className="skeleton h-4 w-6 rounded" /><div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-4 w-16 rounded" /><div className="skeleton h-4 w-14 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && totalCount === 0 && (
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">{tab === "graveyard" ? "🪦" : "📊"}</p>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              {tab === "graveyard" ? "No casualties this month... yet." : "No traders yet. Be the first!"}
            </p>
            {tab === "leaderboard" && (
              <Link href="/stocks" className="btn btn-primary btn-sm mt-3 inline-flex">Start Trading</Link>
            )}
          </div>
        )}

        {/* Leaderboard rows */}
        {tab === "leaderboard" && lbData?.entries.map((e) => {
          const isMe = currentUserId !== null && e.userId === currentUserId;
          return (
            <div key={e.rank}>
              <button
                onClick={() => setExpandedRow(expandedRow === e.rank ? null : e.rank)}
                className="w-full grid grid-cols-[48px_1fr_110px_90px] sm:grid-cols-[48px_1fr_120px_100px_80px] items-start px-4 py-3 text-left transition-colors"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: isMe ? "rgba(124,108,252,0.06)" : expandedRow === e.rank ? "var(--surface-2)" : "transparent",
                }}>
                <span className="text-sm font-bold pt-0.5" style={{ color: e.rank <= 3 ? "#fbbf24" : "var(--text)" }}>
                  {e.rank <= 3 ? ["", "🥇", "🥈", "🥉"][e.rank] : `#${e.rank}`}
                </span>
                <div>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: isMe ? "var(--accent)" : "var(--text-2)" }}>
                      {isMe ? "You" : `Trader_${e.userId.slice(0, 6)}`}
                    </span>
                    {isMe && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                        style={{ background: "rgba(124,108,252,0.2)", color: "var(--accent)", border: "1px solid rgba(124,108,252,0.3)" }}>
                        ME
                      </span>
                    )}
                  </span>
                  <ReactionBar targetId={e.userId} />
                </div>
                <span className="text-xs tabular-nums font-semibold pt-0.5" style={{ color: "var(--text)" }}>${e.totalValue.toFixed(2)}</span>
                <span className="text-xs tabular-nums font-semibold pt-0.5"
                  style={{ color: e.returnPct >= 0 ? "var(--up)" : "var(--down)" }}>
                  {e.returnPct >= 0 ? "+" : ""}{e.returnPct.toFixed(2)}%
                </span>
                <span className="text-xs tabular-nums hidden sm:block pt-0.5" style={{ color: "var(--text-2)" }}>{e.positionCount}</span>
              </button>
              {expandedRow === e.rank && (
                <div className="px-4 py-3 space-y-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <PositionChips positions={e.positions} />
                </div>
              )}
            </div>
          );
        })}

        {/* Graveyard rows */}
        {tab === "graveyard" && gyData?.entries.map((e) => {
          const isMe = currentUserId !== null && e.userId === currentUserId;
          return (
            <div key={e.rank}>
              <button
                onClick={() => setExpandedRow(expandedRow === e.rank ? null : e.rank)}
                className="w-full grid grid-cols-[48px_1fr_110px_120px] items-start px-4 py-3 text-left transition-colors"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: isMe ? "rgba(248,113,113,0.06)" : expandedRow === e.rank ? "var(--surface-2)" : "transparent",
                }}>
                <span className="text-sm pt-0.5">🪦</span>
                <div>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: isMe ? "var(--down)" : "var(--text-2)" }}>
                      {isMe ? "You" : `Trader_${e.userId.slice(0, 6)}`}
                    </span>
                    {isMe && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                        style={{ background: "rgba(248,113,113,0.2)", color: "var(--down)", border: "1px solid rgba(248,113,113,0.3)" }}>
                        ME
                      </span>
                    )}
                  </span>
                  <ReactionBar targetId={e.userId} />
                </div>
                <span className="text-xs tabular-nums font-semibold pt-0.5" style={{ color: "var(--down)" }}>
                  ${e.finalValue.toFixed(2)}
                </span>
                <span className="text-[10px] pt-0.5" style={{ color: "var(--text-3)" }}>
                  {new Date(e.liquidatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </button>
              {expandedRow === e.rank && (
                <div className="px-4 py-3 space-y-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--down)" }}>
                    Final Portfolio (at liquidation)
                  </p>
                  <PositionChips positions={e.positions} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--surface-2)", color: page <= 1 ? "var(--text-3)" : "var(--text)", opacity: page <= 1 ? 0.5 : 1 }}>←</button>
          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="text-xs px-1" style={{ color: "var(--text-3)" }}>…</span>
            ) : (
              <button key={p} onClick={() => goToPage(p as number)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: p === page ? "var(--accent)" : "var(--surface-2)", color: p === page ? "#fff" : "var(--text-2)" }}>{p}</button>
            )
          )}
          <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--surface-2)", color: page >= totalPages ? "var(--text-3)" : "var(--text)", opacity: page >= totalPages ? 0.5 : 1 }}>→</button>
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>
        {totalCount > 0 && `Showing ${((page - 1) * 20) + 1}–${Math.min(page * 20, totalCount)} of ${totalCount} ${tab === "graveyard" ? "casualties" : "traders"}`}
        {tab === "leaderboard" && myRank && !lbData?.entries.some(e => e.userId === currentUserId) && ` · Your rank: #${myRank.rank}`}
        {tab === "graveyard" && gyData?.month && ` · ${gyData.month}`}
        {" · "}{remaining} reactions left today
      </p>
    </div>
  );
}
