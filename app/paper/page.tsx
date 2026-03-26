"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import { RoastCard } from "@/components/RoastCard";

interface Position {
  ticker: string;
  name: string;
  logo_url: string | null;
  side: string;
  shares: number;
  avg_cost: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  borrowed: number;
  equity: number;
  leverage: number;
  pnl: number;
  pnlPct: number;
}

interface Portfolio {
  cashBalance: number;
  nickname: string | null;
  totalMarketValue: number;
  totalBorrowed: number;
  totalEquity: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  positions: Position[];
  streak: number;
  lastCheckin: string | null;
  status: string;
}

interface LiquidationStatus {
  status: string;
  message?: string;
  totalValue?: number;
  hoursLeft?: number;
  suspendedUntil?: string;
  cashBalance?: number;
}

interface ChallengePick {
  ticker: string;
  direction: "up" | "down" | null;
  base_price: number;
  final_price: number | null;
  correct: boolean | null;
  currentPrice?: number;
  currentPct?: number;
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
  picks?: ChallengePick[];
  challenge_type?: string;
  correctCount?: number;
  currentPrice?: number;
  currentPct?: number;
  claimed?: boolean;
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
  const [shareMsg, setShareMsg] = useState("");
  const [predictions, setPredictions] = useState<Record<string, "up" | "down">>({});
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [claimingReward, setClaimingReward] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeRetrying, setChallengeRetrying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [updatingNickname, setUpdatingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState("");

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
    if (challengeRes.ok) {
      setChallengeError(null);
      setChallenge(await challengeRes.json());
    } else {
      const err = await challengeRes.json().catch(() => null);
      setChallengeError(err?.error ?? `Challenge unavailable (${challengeRes.status})`);
    }
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

  async function retryChallenge() {
    setChallengeRetrying(true);
    setChallengeError(null);
    try {
      const res = await fetch("/api/paper/challenge");
      if (res.ok) {
        setChallenge(await res.json());
        setChallengeError(null);
      } else {
        const err = await res.json().catch(() => null);
        setChallengeError(err?.error ?? `Challenge unavailable (${res.status})`);
      }
    } catch {
      setChallengeError("Network error — please try again");
    } finally {
      setChallengeRetrying(false);
    }
  }

  async function submitChallenge() {
    if (!challenge?.picks) return;
    const allPicked = challenge.picks.every((p) => predictions[p.ticker]);
    if (!allPicked) return;

    setSubmittingChallenge(true);
    const picks = challenge.picks.map((p) => ({
      ticker: p.ticker,
      direction: predictions[p.ticker],
    }));
    const res = await fetch("/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks }),
    });
    if (res.ok) loadAll();
    setSubmittingChallenge(false);
  }

  async function claimReward() {
    setClaimingReward(true);
    const res = await fetch("/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    });
    if (res.ok) loadAll();
    setClaimingReward(false);
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

  // Liquidated / suspended state
  if (liqStatus?.status === "liquidated" || liqStatus?.status === "suspended") {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center space-y-4 fade-up">
        <PaperTradeBanner />
        <div className="text-5xl">&#x1F480;</div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--down)" }}>LIQUIDATED</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{liqStatus.message}</p>
        {liqStatus.suspendedUntil && (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Trading resumes {liqStatus.suspendedUntil}
          </p>
        )}
        <p className="text-xs" style={{ color: "var(--up)" }}>
          Daily check-ins still earn cash — build up your balance for next month!
        </p>
      </div>
    );
  }

  if (!portfolio) return null;

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Paper Trading</h1>
            <button 
              onClick={() => { setShowSettings(true); setNewNickname(portfolio.nickname || ""); setNicknameError(""); }}
              className="text-[10px] font-semibold px-2 py-1 rounded"
              style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
            >
              ⚙️ {portfolio.nickname ? `Alias: ${portfolio.nickname}` : "Set Alias"}
            </button>
          </div>
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
          {/* Weekly Challenge — Error / Retry */}
          {!challenge && challengeError && (
            <div className="rounded-xl p-4 text-center space-y-2"
              style={{ background: "var(--surface-2)", border: "1px dashed var(--border-md)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Weekly Prediction
              </p>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>{challengeError}</p>
              <button
                onClick={retryChallenge}
                disabled={challengeRetrying}
                className="btn btn-primary btn-sm"
              >
                {challengeRetrying ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}
          {/* Weekly Challenge — Prediction */}
          {challenge && challenge.picks && challenge.status === "active" && (
            <div className="card-accent rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                  &#x1F3B0; Weekly Prediction
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  Submit by {challenge.week_end} (Fri close)
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                Predict UP or DOWN for each. $100 per correct pick. 4+ correct = 1.5x, 5/5 = 2x!
              </p>
              <div className="space-y-2">
                {challenge.picks.map((pick) => (
                  <div key={pick.ticker} className="flex items-center justify-between rounded-lg p-2.5"
                    style={{ background: "var(--surface-2)" }}>
                    <div>
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{pick.ticker}</span>
                      <span className="text-[10px] ml-2 tabular-nums" style={{ color: "var(--text-3)" }}>
                        ${pick.base_price.toFixed(2)}
                      </span>
                      {pick.currentPct != null && (
                        <span className="text-[10px] ml-1 tabular-nums"
                          style={{ color: pick.currentPct >= 0 ? "var(--up)" : "var(--down)" }}>
                          ({pick.currentPct >= 0 ? "+" : ""}{pick.currentPct.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPredictions((prev) => ({ ...prev, [pick.ticker]: "up" }))}
                        className="px-3 py-1 rounded text-[11px] font-semibold transition-all"
                        style={{
                          background: predictions[pick.ticker] === "up" ? "rgba(74,222,128,0.2)" : "var(--surface-3)",
                          color: predictions[pick.ticker] === "up" ? "var(--up)" : "var(--text-3)",
                          border: predictions[pick.ticker] === "up" ? "1px solid var(--up)" : "1px solid transparent",
                        }}
                      >
                        &#x2B06; UP
                      </button>
                      <button
                        onClick={() => setPredictions((prev) => ({ ...prev, [pick.ticker]: "down" }))}
                        className="px-3 py-1 rounded text-[11px] font-semibold transition-all"
                        style={{
                          background: predictions[pick.ticker] === "down" ? "rgba(248,113,113,0.2)" : "var(--surface-3)",
                          color: predictions[pick.ticker] === "down" ? "var(--down)" : "var(--text-3)",
                          border: predictions[pick.ticker] === "down" ? "1px solid var(--down)" : "1px solid transparent",
                        }}
                      >
                        &#x2B07; DOWN
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={submitChallenge}
                disabled={submittingChallenge || challenge.picks.some((p) => !predictions[p.ticker])}
                className="btn btn-primary btn-sm btn-block"
                style={{
                  opacity: challenge.picks.every((p) => predictions[p.ticker]) ? 1 : 0.5,
                }}
              >
                {submittingChallenge ? "Submitting..." : "Lock In Predictions"}
              </button>
            </div>
          )}
          {challenge && challenge.picks && challenge.status === "pending" && (
            <div className="card-accent rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                  &#x1F3B0; Predictions Locked
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  Results on {challenge.week_end} (Fri close)
                </span>
              </div>
              <div className="space-y-2">
                {challenge.picks.map((pick) => (
                  <div key={pick.ticker} className="flex items-center justify-between rounded-lg p-2.5"
                    style={{ background: "var(--surface-2)" }}>
                    <div>
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{pick.ticker}</span>
                      <span className="text-[10px] ml-2 tabular-nums" style={{ color: "var(--text-3)" }}>
                        ${pick.base_price.toFixed(2)}
                      </span>
                      {pick.currentPct != null && (
                        <span className="text-[10px] ml-1 tabular-nums"
                          style={{ color: pick.currentPct >= 0 ? "var(--up)" : "var(--down)" }}>
                          ({pick.currentPct >= 0 ? "+" : ""}{pick.currentPct.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: pick.direction === "up" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                        color: pick.direction === "up" ? "var(--up)" : "var(--down)",
                      }}>
                      {pick.direction === "up" ? "⬆ UP" : "⬇ DOWN"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {challenge && challenge.picks && challenge.status === "completed" && (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--up)" }}>
                  &#x2705; Weekly Results
                </p>
                <span className="text-xs font-bold" style={{ color: "var(--up)" }}>
                  {challenge.reward_usd > 0 ? `+$${challenge.reward_usd}` : "$0"}
                </span>
              </div>
              <div className="space-y-1.5">
                {challenge.picks.map((pick) => (
                  <div key={pick.ticker} className="flex items-center justify-between rounded-lg p-2"
                    style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{pick.correct ? "✅" : "❌"}</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{pick.ticker}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--text-3)" }}>
                        ${pick.base_price.toFixed(2)} → ${pick.final_price?.toFixed(2) ?? "?"}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold"
                      style={{ color: pick.direction === "up" ? "var(--up)" : "var(--down)" }}>
                      {pick.direction === "up" ? "⬆" : "⬇"} {pick.correct ? "$100" : "$0"}
                    </span>
                  </div>
                ))}
              </div>
              {/* Claim reward button — only if not yet claimed */}
              {challenge.reward_usd > 0 && !challenge.claimed ? (
                <button
                  onClick={claimReward}
                  disabled={claimingReward}
                  className="btn btn-primary btn-sm btn-block"
                  style={{ background: "linear-gradient(135deg, var(--up), #22c55e)" }}
                >
                  {claimingReward ? "Claiming..." : `Claim $${challenge.reward_usd} Reward`}
                </button>
              ) : challenge.claimed ? (
                <p className="text-[10px] text-center font-medium" style={{ color: "var(--up)" }}>
                  &#x2705; Reward claimed!
                </p>
              ) : (
                <p className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>
                  Better luck next week!
                </p>
              )}
            </div>
          )}
          {challenge && challenge.status === "expired" && (
            <div className="rounded-xl p-3 text-center"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Weekly challenge expired. A new one will appear next Monday!
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
                  className="card-clickable rounded-xl p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3 w-full">
                    {p.logo_url && (
                      <Image src={p.logo_url} alt={p.ticker} width={32} height={32}
                        className="rounded-lg object-contain bg-white p-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{p.ticker}</span>
                        {p.side === "short" && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{ background: "rgba(249,115,22,0.15)", color: "#f97316" }}>
                            SHORT
                          </span>
                        )}
                        {p.leverage > 1 && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                            {p.leverage}x
                          </span>
                        )}
                        <span className="text-xs truncate" style={{ color: "var(--text-3)" }}>{p.name}</span>
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
                  </div>
                  
                  {/* Position Health Bar for Leveraged Trades */}
                  {p.leverage > 1 && (
                    <div className="w-full pt-2 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span style={{ color: "var(--text-3)" }}>Risk Health (Equity vs Debt)</span>
                        <span style={{ color: (p.equity || 0) <= (p.borrowed || 0) * 0.1 ? "var(--down)" : "var(--text-2)", fontWeight: "bold" }}>
                          {(p.equity || 0) <= 0 ? "🚨 Margin Call" : (p.equity || 0) <= (p.borrowed || 0) * 0.1 ? "⚠️ High Risk" : "OK"}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden flex bg-gray-700 w-full relative">
                        <div style={{
                          width: `${Math.max(0, Math.min(100, ((p.equity || 0) / ((p.equity || 0) + (p.borrowed || 0))) * 100))}%`,
                          background: (p.equity || 0) <= (p.borrowed || 0) * 0.1 ? "var(--down)" : "var(--up)"
                        }} />
                      </div>
                      <div className="flex justify-between text-[10px] mt-1 opacity-70">
                        <span style={{ color: "var(--up)" }}>Eq: {formatMoney(p.equity || 0)}</span>
                        <span style={{ color: "var(--down)" }}>Debt: {formatMoney(p.borrowed || 0)}</span>
                      </div>
                    </div>
                  )}
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
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}>
          <div className="card rounded-2xl w-full max-w-sm p-6 space-y-4 fade-up relative" style={{ background: "var(--surface)" }}>
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-xs font-bold" style={{ color: "var(--text-3)" }}>
              &times; CLOSE
            </button>
            <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>Settings</h2>
            
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Leaderboard Alias</label>
              <input 
                type="text" 
                value={newNickname} 
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="e.g. StonksKing" 
                className="input input-lg w-full"
                maxLength={20}
              />
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>You can only change your alias once every 30 days.</p>
            </div>

            {nicknameError && (
              <p className="text-[11px] font-semibold py-1.5 px-3 rounded" style={{ background: "var(--down-dim)", color: "var(--down)" }}>
                {nicknameError}
              </p>
            )}

            <button
              onClick={async () => {
                setUpdatingNickname(true);
                setNicknameError("");
                try {
                  const res = await fetch("/api/user/nickname", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nickname: newNickname })
                  });
                  const data = await res.json();
                  if (!res.ok) setNicknameError(data.error || "Failed to update.");
                  else {
                    setPortfolio((prev) => prev ? { ...prev, nickname: data.nickname } : prev);
                    setShowSettings(false);
                  }
                } catch (e) {
                  setNicknameError("Network error. Try again.");
                } finally {
                  setUpdatingNickname(false);
                }
              }}
              disabled={updatingNickname || !newNickname || newNickname === portfolio.nickname}
              className="btn btn-primary btn-block"
            >
              {updatingNickname ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
