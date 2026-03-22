"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import { AchievementBadge } from "@/components/AchievementBadge";
import { ALL_BADGE_KEYS } from "@/lib/achievements";
import { RoastCard } from "@/components/RoastCard";

interface Position {
  ticker: string;
  name: string;
  logo_url: string | null;
  shares: number;
  avg_cost: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
}

interface Portfolio {
  cashBalance: number;
  totalMarketValue: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  positions: Position[];
  achievements: { badge_key: string; earned_at: string }[];
  streak: number;
  lastCheckin: string | null;
  status: string;
}

interface LiquidationStatus {
  status: string;
  message?: string;
  totalValue?: number;
  hoursLeft?: number;
  canRevive?: boolean;
  suspendedUntil?: string;
}

interface Challenge {
  id: number;
  ticker: string;
  target_pct: number;
  week_start: string;
  week_end: string;
  entry_price: number | null;
  status: string;
  reward_usd: number;
  currentPrice?: number;
  currentPct?: number;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaperTradingPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [liqStatus, setLiqStatus] = useState<LiquidationStatus | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinResult, setCheckinResult] = useState<{ reward: number; streak: number; bonusMessage?: string } | null>(null);
  const [checkinDone, setCheckinDone] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth/login");
      else { setAuthed(true); setUserId(user.id); }
    });
  }, [supabase, router]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [portfolioRes, liqRes, challengeRes] = await Promise.all([
      fetch("/api/paper/portfolio"),
      fetch("/api/paper/liquidation"),
      fetch("/api/paper/challenge"),
    ]);

    if (portfolioRes.ok) {
      const data = await portfolioRes.json();
      setPortfolio(data);
      const today = new Date().toISOString().split("T")[0];
      setCheckinDone(data.lastCheckin === today);
    }
    if (liqRes.ok) setLiqStatus(await liqRes.json());
    if (challengeRes.ok) setChallenge(await challengeRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  async function handleCheckin() {
    const res = await fetch("/api/paper/checkin", { method: "POST" });
    const data = await res.json();
    if (data.alreadyCheckedIn) { setCheckinDone(true); return; }
    if (res.ok) {
      setCheckinResult(data);
      setCheckinDone(true);
      loadAll(); // refresh portfolio
    }
  }

  async function handleRevive() {
    setReviving(true);
    const res = await fetch("/api/paper/revive", { method: "POST" });
    if (res.ok) loadAll();
    setReviving(false);
  }

  function handleShare() {
    const url = `${window.location.origin}/og/paper?user=${userId}`;
    const text = portfolio
      ? `My paper trading portfolio: ${formatMoney(portfolio.totalValue)} (${portfolio.totalPnlPct >= 0 ? "+" : ""}${portfolio.totalPnlPct.toFixed(2)}%) on Buy High Sell Low`
      : "Check out my paper trading portfolio on Buy High Sell Low";

    if (navigator.share) {
      navigator.share({ title: "My Paper Portfolio", text, url: window.location.origin + "/paper" });
    } else {
      navigator.clipboard.writeText(text + " " + window.location.origin + "/paper");
      setShareMsg("Copied to clipboard!");
      setTimeout(() => setShareMsg(""), 2000);
    }
  }

  if (authed === null || loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-8 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  // Suspended state
  if (liqStatus?.status === "suspended") {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center space-y-4 fade-up">
        <PaperTradeBanner />
        <div className="text-5xl">&#x1F6AB;</div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Account Suspended</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{liqStatus.message}</p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          You&apos;ll automatically restart with $1,000 on {liqStatus.suspendedUntil}.
        </p>
      </div>
    );
  }

  // Liquidated state
  if (liqStatus?.status === "liquidated") {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center space-y-4 fade-up">
        <PaperTradeBanner />
        <div className="text-5xl">&#x1F480;</div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--down)" }}>LIQUIDATED</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{liqStatus.message}</p>
        {liqStatus.canRevive && (
          <button
            onClick={handleRevive}
            disabled={reviving}
            className="btn btn-primary btn-lg"
          >
            {reviving ? "Reviving..." : "Revive with $500"}
          </button>
        )}
      </div>
    );
  }

  if (!portfolio) return null;

  const earnedKeys = new Set(portfolio.achievements.map((a) => a.badge_key));
  const earnedMap = Object.fromEntries(portfolio.achievements.map((a) => [a.badge_key, a.earned_at]));

  const allocationItems = portfolio.positions
    .map((p) => ({ label: p.ticker, value: p.marketValue }))
    .sort((a, b) => b.value - a.value);
  if (portfolio.cashBalance > 0) allocationItems.push({ label: "Cash", value: portfolio.cashBalance });
  const totalAlloc = allocationItems.reduce((s, i) => s + i.value, 0);

  const COLORS = ["#7c6cfc", "#4ade80", "#f87171", "#fbbf24", "#38bdf8", "#c084fc", "#fb7185", "#34d399"];

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6 fade-up">
      <PaperTradeBanner />

      {/* Margin Call Warning */}
      {liqStatus?.status === "margin_call" && (
        <div className="rounded-xl p-4 text-center animate-pulse"
          style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--down)" }}>
            &#x1F6A8; MARGIN CALL
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>
            {liqStatus.message}
          </p>
        </div>
      )}

      {/* Warning */}
      {liqStatus?.status === "warning" && (
        <div className="rounded-xl p-3 text-center"
          style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <p className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
            &#x26A0;&#xFE0F; {liqStatus.message}
          </p>
        </div>
      )}

      {/* Header + Check-in */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Paper Trading</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
            For those too cowardly to risk real money...
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Daily Check-in */}
          {checkinDone ? (
            <div className="px-3 py-2 rounded-lg text-xs font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
              {checkinResult ? (
                <span style={{ color: "var(--up)" }}>
                  +{formatMoney(checkinResult.reward)} | &#x1F525; {checkinResult.streak}-day streak
                  {checkinResult.bonusMessage}
                </span>
              ) : (
                <span>&#x2705; Checked in | &#x1F525; {portfolio.streak}-day streak</span>
              )}
            </div>
          ) : (
            <button
              onClick={handleCheckin}
              className="btn btn-primary btn-sm animate-pulse"
              style={{ background: "linear-gradient(135deg, var(--accent), #4ade80)" }}
            >
              Daily Check-in
            </button>
          )}
          <Link href="/stocks" className="btn btn-primary btn-sm">
            Trade
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Value", value: formatMoney(portfolio.totalValue), color: "var(--text)" },
          { label: "Cash", value: formatMoney(portfolio.cashBalance), color: "var(--text)" },
          { label: "P&L", value: `${portfolio.totalPnl >= 0 ? "+" : ""}${formatMoney(portfolio.totalPnl)}`, color: portfolio.totalPnl >= 0 ? "var(--up)" : "var(--down)" },
          { label: "Return", value: `${portfolio.totalPnlPct >= 0 ? "+" : ""}${portfolio.totalPnlPct.toFixed(2)}%`, color: portfolio.totalPnlPct >= 0 ? "var(--up)" : "var(--down)" },
        ].map((s) => (
          <div key={s.label} className="card rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--text-3)" }}>
              {s.label}
            </p>
            <p className="text-xl font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Weekly Challenge */}
          {challenge && challenge.status === "active" && (
            <div className="card-accent rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                  &#x1F3AF; Weekly Challenge
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  Ends {challenge.week_end}
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {challenge.ticker} hits +{challenge.target_pct}% this week
              </p>
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs" style={{ color: "var(--text-2)" }}>
                  Entry: ${challenge.entry_price?.toFixed(2) ?? "N/A"}
                  {challenge.currentPct != null && (
                    <span style={{ color: challenge.currentPct >= 0 ? "var(--up)" : "var(--down)", marginLeft: 8 }}>
                      Current: {challenge.currentPct >= 0 ? "+" : ""}{challenge.currentPct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <span className="badge" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                  Reward: ${challenge.reward_usd}
                </span>
              </div>
              {/* Progress bar */}
              {challenge.currentPct != null && (
                <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--surface-3)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, (challenge.currentPct / challenge.target_pct) * 100))}%`,
                      background: challenge.currentPct >= challenge.target_pct ? "var(--up)" : "var(--accent)",
                    }} />
                </div>
              )}
            </div>
          )}
          {challenge && challenge.status === "completed" && (
            <div className="rounded-xl p-4" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--up)" }}>
                &#x2705; Weekly Challenge Complete! +${challenge.reward_usd} earned
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Holdings ({portfolio.positions.length})
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                className="text-[11px] font-medium flex items-center gap-1"
                style={{ color: "var(--text-3)" }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                {shareMsg || "Share"}
              </button>
              <Link href="/paper/history" className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                Transaction History
              </Link>
            </div>
          </div>

          {portfolio.positions.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ border: "1px dashed var(--border-md)" }}>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>No holdings yet.</p>
              <Link href="/stocks" className="btn btn-primary btn-sm mt-3 inline-flex">
                Make your first trade
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {portfolio.positions.map((p) => (
                <Link
                  key={p.ticker}
                  href={`/paper/trade/${p.ticker}`}
                  className="card-clickable rounded-xl p-4 flex items-center gap-3"
                >
                  {p.logo_url && (
                    <Image src={p.logo_url} alt={p.ticker} width={32} height={32}
                      className="rounded-lg object-contain bg-white p-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{p.ticker}</span>
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>{p.name}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {p.shares.toFixed(4)} shares @ {formatMoney(p.avg_cost)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                      {formatMoney(p.marketValue)}
                    </p>
                    <p className="text-xs font-medium tabular-nums"
                      style={{ color: p.pnl >= 0 ? "var(--up)" : "var(--down)" }}>
                      {p.pnl >= 0 ? "+" : ""}{formatMoney(p.pnl)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%)
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Allocation */}
          {allocationItems.length > 0 && (
            <div className="card rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Allocation
              </p>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "var(--surface-3)" }}>
                {allocationItems.map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      width: `${(item.value / totalAlloc) * 100}%`,
                      background: COLORS[i % COLORS.length],
                    }}
                    title={`${item.label}: ${((item.value / totalAlloc) * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                {allocationItems.map((item, i) => (
                  <div key={item.label} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span style={{ color: "var(--text-2)" }}>{item.label}</span>
                    </div>
                    <span className="tabular-nums" style={{ color: "var(--text)" }}>
                      {((item.value / totalAlloc) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Roast */}
          <RoastCard />

          {/* Leaderboard link */}
          <Link
            href="/paper/leaderboard"
            className="card-clickable rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Leaderboard</p>
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>See how you rank</p>
            </div>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
              style={{ color: "var(--text-3)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Achievements */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          Achievements ({portfolio.achievements.length}/{ALL_BADGE_KEYS.length})
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {ALL_BADGE_KEYS.map((key) => (
            <AchievementBadge
              key={key}
              badgeKey={key}
              earned={earnedKeys.has(key)}
              earnedAt={earnedMap[key]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
