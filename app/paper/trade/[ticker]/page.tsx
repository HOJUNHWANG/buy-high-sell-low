"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";

interface StockInfo {
  ticker: string;
  name: string;
  logo_url: string | null;
  price: number;
  change_pct: number | null;
}

interface PositionInfo {
  shares: number;
  avg_cost: number;
  pnl: number;
  pnlPct: number;
  marketValue: number;
  borrowed: number;
  equity: number;
  leverage: number;
  side: string;
}

interface TradeResult {
  ok: boolean;
  side: string;
  shares: number;
  price: number;
  margin?: number;
  borrowed?: number;
  leverage?: number;
  grossProceeds?: number;
  borrowedRepay?: number;
  netProceeds?: number;
  costToCover?: number;
  marginReturned?: number;
  cashBalance: number;

  realizedPnl?: number;
}

type TradeSide = "buy" | "sell" | "short" | "cover";

export default function TradePage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params);
  const ticker = rawTicker.toUpperCase();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [longPosition, setLongPosition] = useState<PositionInfo | null>(null);
  const [shortPosition, setShortPosition] = useState<PositionInfo | null>(null);
  const [cashBalance, setCashBalance] = useState(0);
  const [side, setSide] = useState<TradeSide>("buy");
  const [inputMode, setInputMode] = useState<"shares" | "dollars">("dollars");
  const [inputValue, setInputValue] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth/login");
      else setAuthed(true);
    });
  }, [supabase, router]);

  const loadData = () => {
    if (!authed) return;
    Promise.all([
      fetch(`/api/search?q=${ticker}`).then((r) => r.json()),
      fetch("/api/paper/portfolio").then((r) => r.json()),
      supabase.from("stock_prices").select("price, change_pct").eq("ticker", ticker).single(),
    ]).then(([searchResults, portfolio, { data: priceData }]) => {
      const matched = searchResults.find((s: { ticker: string }) => s.ticker === ticker);
      if (!matched) return;

      const positions = portfolio.positions ?? [];
      const longPos = positions.find((p: { ticker: string; side: string }) => p.ticker === ticker && p.side !== "short");
      const shortPos = positions.find((p: { ticker: string; side: string }) => p.ticker === ticker && p.side === "short");
      const currentPrice = priceData?.price ?? longPos?.currentPrice ?? shortPos?.currentPrice ?? 0;

      setStock({
        ticker: matched.ticker,
        name: matched.name,
        logo_url: matched.logo_url,
        price: currentPrice,
        change_pct: priceData?.change_pct ?? null,
      });

      const mapPos = (pos: Record<string, number | string | null> | undefined): PositionInfo | null => {
        if (!pos) return null;
        return {
          shares: pos.shares as number,
          avg_cost: pos.avg_cost as number,
          pnl: pos.pnl as number,
          pnlPct: pos.pnlPct as number,
          marketValue: pos.marketValue as number,
          borrowed: (pos.borrowed as number) ?? 0,
          equity: (pos.equity as number) ?? (pos.marketValue as number),
          leverage: (pos.leverage as number) ?? 1,
          side: (pos.side as string) ?? "long",
        };
      };

      setLongPosition(mapPos(longPos));
      setShortPosition(mapPos(shortPos));
      setCashBalance(portfolio.cashBalance);
    });
  };

  useEffect(loadData, [authed, ticker, supabase]);

  // Active position for the current side
  const activePosition = (side === "sell") ? longPosition
    : (side === "cover") ? shortPosition
    : null;

  const shares = inputMode === "shares"
    ? parseFloat(inputValue) || 0
    : stock?.price ? (parseFloat(inputValue) || 0) / stock.price : 0;
  const showLeverage = side === "buy" || side === "short";
  const effectiveShares = showLeverage ? shares * leverage : shares;
  const estimatedTotal = stock ? shares * stock.price : 0;

  // Estimated short P&L preview for cover
  const estimatedShortPnl = side === "cover" && shortPosition && stock
    ? (shortPosition.avg_cost - stock.price) * shares
    : 0;

  async function executeTrade() {
    setError("");
    setResult(null);
    if (shares <= 0) { setError("Enter a valid amount"); return; }

    const endpoint = side === "buy" ? "buy"
      : side === "sell" ? "sell"
      : side === "short" ? "short"
      : "cover";

    setLoading(true);
    try {
      const res = await fetch(`/api/paper/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          shares,
          ...(showLeverage && leverage > 1 ? { leverage } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data);
      setCashBalance(data.cashBalance);
      setInputValue("");

      // Refresh positions
      const portfolioRes = await fetch("/api/paper/portfolio");
      if (portfolioRes.ok) {
        const portfolio = await portfolioRes.json();
        const positions = portfolio.positions ?? [];
        const longPos = positions.find((p: { ticker: string; side: string }) => p.ticker === ticker && p.side !== "short");
        const shortPos = positions.find((p: { ticker: string; side: string }) => p.ticker === ticker && p.side === "short");

        const mapPos = (pos: Record<string, number | string | null> | undefined): PositionInfo | null => {
          if (!pos) return null;
          return {
            shares: pos.shares as number,
            avg_cost: pos.avg_cost as number,
            pnl: pos.pnl as number,
            pnlPct: pos.pnlPct as number,
            marketValue: pos.marketValue as number,
            borrowed: (pos.borrowed as number) ?? 0,
            equity: (pos.equity as number) ?? (pos.marketValue as number),
            leverage: (pos.leverage as number) ?? 1,
            side: (pos.side as string) ?? "long",
          };
        };
        setLongPosition(mapPos(longPos));
        setShortPosition(mapPos(shortPos));
      }
    } catch {
      setError("Trade failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!authed || !stock) {
    return (
      <div className="max-w-xl mx-auto px-5 py-8 space-y-4">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
    );
  }

  const isUp = (stock.change_pct ?? 0) >= 0;

  const sideConfig: Record<TradeSide, { label: string; color: string; bg: string }> = {
    buy: { label: "BUY", color: "var(--up)", bg: "rgba(74,222,128,0.15)" },
    sell: { label: "SELL", color: "var(--down)", bg: "rgba(248,113,113,0.15)" },
    short: { label: "SHORT", color: "#f97316", bg: "rgba(249,115,22,0.15)" },
    cover: { label: "COVER", color: "#38bdf8", bg: "rgba(56,189,248,0.15)" },
  };

  const maxForSide = () => {
    if (side === "buy" || side === "short") return cashBalance;
    if (side === "sell" && longPosition) return longPosition.shares * (stock?.price ?? 0);
    if (side === "cover" && shortPosition) return shortPosition.shares * (stock?.price ?? 0);
    return 0;
  };

  const maxSharesForSide = () => {
    if ((side === "buy" || side === "short") && stock?.price) return cashBalance / stock.price;
    if (side === "sell" && longPosition) return longPosition.shares;
    if (side === "cover" && shortPosition) return shortPosition.shares;
    return 0;
  };

  return (
    <div className="max-w-xl mx-auto px-5 py-8 space-y-5 fade-up">
      <PaperTradeBanner />

      {/* Stock header */}
      <div className="flex items-center gap-3">
        {stock.logo_url && (
          <Image src={stock.logo_url} alt={stock.name} width={40} height={40}
            className="rounded-xl object-contain bg-white p-0.5" />
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>{stock.ticker}</h1>
            <Link href={`/stock/${stock.ticker}`} className="text-[10px]" style={{ color: "var(--accent)" }}>
              View details
            </Link>
          </div>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>{stock.name}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-bold tabular-nums" style={{ color: "var(--text)" }}>
            ${stock.price.toFixed(2)}
          </p>
          {stock.change_pct != null && (
            <p className="text-xs font-semibold tabular-nums"
              style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
              {isUp ? "+" : ""}{stock.change_pct.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      {/* Current positions */}
      {[
        { pos: longPosition, label: "Long Position", badge: "LONG", badgeColor: "var(--up)" },
        { pos: shortPosition, label: "Short Position", badge: "SHORT", badgeColor: "#f97316" },
      ].map(({ pos, label, badge, badgeColor }) => pos && (
        <div key={badge} className="card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              {label}
            </p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${badgeColor}20`, color: badgeColor }}>
              {badge}
            </span>
            {pos.leverage > 1 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                {pos.leverage}x
              </span>
            )}
          </div>
          {/* Health Bar / Margin Warning */}
          {pos.leverage > 1 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
                <span>Health (Equity vs Loan)</span>
                <span style={{ color: pos.equity <= 0 ? "var(--down)" : "var(--text-2)" }}>
                  {pos.equity <= 0 ? "⚠️ Liquidation Risk" : "OK"}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden flex bg-gray-700 w-full relative">
                <div style={{
                  width: `${Math.max(0, Math.min(100, (pos.equity / (pos.equity + pos.borrowed)) * 100))}%`,
                  background: pos.equity <= pos.borrowed * 0.1 ? "var(--down)" : "var(--up)"
                }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 text-center mt-3">
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Shares</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {pos.shares.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {badge === "SHORT" ? "Entry" : "Avg Cost"}
              </p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                ${pos.avg_cost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>P&L</p>
              <p className="text-sm font-semibold tabular-nums"
                style={{ color: pos.pnl >= 0 ? "var(--up)" : "var(--down)" }}>
                {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                <span className="text-[10px] ml-0.5">({pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(1)}%)</span>
              </p>
            </div>
          </div>
          {pos.borrowed > 0 && (
            <div className="grid grid-cols-2 gap-3 text-center mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div>
                <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Debt</p>
                <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--down)" }}>
                  ${pos.borrowed.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Equity</p>
                <p className="text-xs font-semibold tabular-nums"
                  style={{ color: pos.equity >= 0 ? "var(--up)" : "var(--down)" }}>
                  ${pos.equity.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Trade form */}
      <div className="card rounded-xl p-5 space-y-4">
        {/* 4-tab selector: Buy / Sell / Short / Cover */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
          {(["buy", "sell", "short", "cover"] as const).map((s) => {
            const cfg = sideConfig[s];
            const disabled = (s === "sell" && !longPosition) || (s === "cover" && !shortPosition);
            return (
              <button
                key={s}
                onClick={() => { if (!disabled) { setSide(s); setResult(null); setError(""); setLeverage(1); } }}
                disabled={disabled}
                className="flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background: side === s ? cfg.bg : "transparent",
                  color: disabled ? "var(--text-4)" : side === s ? cfg.color : "var(--text-3)",
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Plain English Action Explanation */}
        <div className="rounded-lg px-3 py-2 text-[10px] space-y-1"
          style={{ 
            background: side === "short" ? "rgba(249,115,22,0.08)" : "var(--surface-3)", 
            color: side === "short" ? "#f97316" : "var(--text-2)", 
            border: side === "short" ? "1px solid rgba(249,115,22,0.2)" : "1px solid var(--border-md)" 
          }}>
          {side === "buy" ? (
            <p><strong>BUY (Long):</strong> You profit if the price goes UP. You own the shares.</p>
          ) : side === "sell" ? (
            <p><strong>SELL:</strong> Close your existing Long position to lock in profit/loss and repay any borrowed money.</p>
          ) : side === "short" ? (
            <p><strong>SHORT:</strong> You profit if the price goes DOWN. You borrow shares to sell them, hoping to buy them back cheaper. ⚠️ Losses are theoretically unlimited.</p>
          ) : (
            <p><strong>COVER:</strong> Close your Short position by buying back the borrowed shares to lock in profit/loss.</p>
          )}
        </div>

        {/* Input mode toggle */}
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: "var(--text-3)" }}>Enter by:</span>
          {(["dollars", "shares"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setInputMode(m); setInputValue(""); }}
              className="px-2 py-1 rounded text-xs font-medium"
              style={{
                background: inputMode === m ? "var(--surface-3)" : "transparent",
                color: inputMode === m ? "var(--text)" : "var(--text-3)",
              }}
            >
              {m === "dollars" ? "$ Amount" : "Shares"}
            </button>
          ))}
        </div>

        {/* Leverage selector (buy & short) */}
        {showLeverage && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs" style={{ color: "var(--text-3)" }}>Leverage:</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: leverage > 1 ? "var(--accent)" : "var(--text-2)" }}>
                {leverage}x
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 5, 10, 25, 50, 100].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{
                    background: leverage === lev ? "var(--accent-dim)" : "var(--surface-3)",
                    color: leverage === lev ? "var(--accent)" : "var(--text-2)",
                    border: leverage === lev ? "1px solid rgba(124,108,252,0.3)" : "1px solid transparent",
                  }}
                >
                  {lev}x
                </button>
              ))}
            </div>
            {leverage > 1 && (
              <p className="text-[10px] mt-1.5" style={{ color: "var(--down)" }}>
                {leverage}x leverage — {side === "short" ? "short squeeze risk amplified" : "gains and losses are amplified"}. Liquidation risk is real.
              </p>
            )}
          </div>
        )}

        {/* Input */}
        <div>
          <input
            type="number"
            min="0"
            step={inputMode === "shares" ? "0.0001" : "0.01"}
            placeholder={inputMode === "dollars" ? "Amount in $" : "Number of shares"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="input input-lg tabular-nums"
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--text-3)" }}>
            Available: ${cashBalance.toFixed(2)}
            {(side === "sell" && longPosition) ? ` | ${longPosition.shares.toFixed(4)} shares (long)` : ""}
            {(side === "cover" && shortPosition) ? ` | ${shortPosition.shares.toFixed(4)} shares (short)` : ""}
          </p>

          {/* Quick amount buttons */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {inputMode === "dollars" ? (
              <>
                {[1, 10, 100, 1000].map((amt) => {
                  const maxAmt = maxForSide();
                  return (
                    <button
                      key={amt}
                      disabled={amt > maxAmt}
                      onClick={() => setInputValue((prev) => {
                        const cur = parseFloat(prev) || 0;
                        const next = Math.min(cur + amt, maxAmt);
                        return next.toFixed(2);
                      })}
                      className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                      style={{
                        background: "var(--surface-3)",
                        color: amt > maxAmt ? "var(--text-4)" : "var(--text-2)",
                        cursor: amt > maxAmt ? "not-allowed" : "pointer",
                        opacity: amt > maxAmt ? 0.5 : 1,
                      }}
                    >
                      +${amt}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    if (side === "buy" || side === "short") {
                      setInputValue(cashBalance.toFixed(2));
                    } else if (side === "sell" && longPosition && stock) {
                      setInputValue((longPosition.shares * stock.price).toFixed(2));
                    } else if (side === "cover" && shortPosition && stock) {
                      setInputValue((shortPosition.shares * stock.price).toFixed(2));
                    }
                  }}
                  disabled={(side === "sell" && !longPosition) || (side === "cover" && !shortPosition)}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                  style={{
                    background: sideConfig[side].bg,
                    color: sideConfig[side].color,
                  }}
                >
                  {side === "buy" ? "Buy All" : side === "sell" ? "Sell All" : side === "short" ? "Short All" : "Cover All"}
                </button>
              </>
            ) : (
              <>
                {[1, 10, 100].map((amt) => {
                  const maxShares = maxSharesForSide();
                  return (
                    <button
                      key={amt}
                      disabled={amt > maxShares}
                      onClick={() => setInputValue((prev) => {
                        const cur = parseFloat(prev) || 0;
                        const next = Math.min(cur + amt, maxShares);
                        return next.toFixed(4);
                      })}
                      className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                      style={{
                        background: "var(--surface-3)",
                        color: amt > maxShares ? "var(--text-4)" : "var(--text-2)",
                        cursor: amt > maxShares ? "not-allowed" : "pointer",
                        opacity: amt > maxShares ? 0.5 : 1,
                      }}
                    >
                      +{amt} {amt === 1 ? "Share" : "Shares"}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    if ((side === "buy" || side === "short") && stock?.price) {
                      setInputValue((cashBalance / stock.price).toFixed(4));
                    } else if (side === "sell" && longPosition) {
                      setInputValue(longPosition.shares.toFixed(4));
                    } else if (side === "cover" && shortPosition) {
                      setInputValue(shortPosition.shares.toFixed(4));
                    }
                  }}
                  disabled={(side === "sell" && !longPosition) || (side === "cover" && !shortPosition)}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                  style={{
                    background: sideConfig[side].bg,
                    color: sideConfig[side].color,
                  }}
                >
                  {side === "buy" ? "Buy All" : side === "sell" ? "Sell All" : side === "short" ? "Short All" : "Cover All"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Order summary */}
        {shares > 0 && (
          <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--surface-2)" }}>
            {showLeverage && leverage > 1 && (
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-3)" }}>Leverage</span>
                <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{leverage}x</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--text-3)" }}>
                {showLeverage && leverage > 1 ? "Effective Shares" : "Shares"}
              </span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>{effectiveShares.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--text-3)" }}>Price</span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>${stock.price.toFixed(2)}</span>
            </div>
            {showLeverage && leverage > 1 && (
              <>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--text-3)" }}>Borrowed</span>
                  <span className="tabular-nums" style={{ color: "var(--down)" }}>
                    ${(estimatedTotal * (leverage - 1)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--text-3)" }}>Total Position Value</span>
                  <span className="tabular-nums" style={{ color: "var(--text)" }}>
                    ${(estimatedTotal * leverage).toFixed(2)}
                  </span>
                </div>
              </>
            )}
            {side === "cover" && shortPosition && (
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-3)" }}>Est. P&L</span>
                <span className="tabular-nums font-semibold"
                  style={{ color: estimatedShortPnl >= 0 ? "var(--up)" : "var(--down)" }}>
                  {estimatedShortPnl >= 0 ? "+" : ""}${estimatedShortPnl.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs font-semibold pt-1"
              style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-2)" }}>
                {(side === "buy" || side === "short")
                  ? (leverage > 1 ? "Your Margin (Cash)" : "Estimated Cost")
                  : side === "cover" ? "Cost to Cover" : "Estimated Proceeds"}
              </span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>${estimatedTotal.toFixed(2)}</span>
            </div>

            {/* Beginner-friendly Leverage Explanation */}
            {showLeverage && leverage > 1 && (
              <div className="mt-3 p-3 rounded-lg text-[11px] space-y-2" style={{ background: "rgba(124,108,252,0.05)", border: "1px solid rgba(124,108,252,0.2)" }}>
                <p style={{ color: "var(--accent)" }}><strong>How this trade works:</strong></p>
                <div className="h-3 w-full rounded flex items-center overflow-hidden" title="Your Money vs Borrowed Money">
                  <div style={{ width: `${(1/leverage)*100}%`, background: "var(--accent)", height: "100%"}}></div>
                  <div style={{ width: `${(1 - 1/leverage)*100}%`, background: "#475569", height: "100%"}}></div>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest">
                  <span style={{ color: "var(--accent)" }}>Your Money: ${(estimatedTotal).toFixed(0)}</span>
                  <span style={{ color: "#94a3b8" }}>Borrowed: ${(estimatedTotal * (leverage - 1)).toFixed(0)}</span>
                </div>
                
                <p style={{ color: "var(--text-2)" }}>
                  If the stock moves <strong>1%</strong>, your actual money moves <strong>{leverage}%</strong>.
                </p>
                <p style={{ color: "var(--down)" }}>
                  <strong>🚨 Danger:</strong> If the stock {side === "short" ? "rises" : "drops"} by <strong>{(100 / leverage).toFixed(1)}%</strong> to <strong className="tabular-nums">${(side === "short" ? stock.price * (1 + 1/leverage) : stock.price * (1 - 1/leverage)).toFixed(2)}</strong>, you will lose your entire ${estimatedTotal.toFixed(2)} investment (Margin Call).
                </p>
              </div>
            )}
            
            {/* Beginner-friendly closing explanation */}
            {(side === "sell" || side === "cover") && (
              <div className="mt-3 p-3 rounded-lg text-[11px] space-y-1" style={{ background: "var(--surface-3)" }}>
                <p style={{ color: "var(--text)" }}><strong>Trade Outcome Summary</strong></p>
                <p style={{ color: "var(--text-2)" }}>
                  By closing this position, you are securing a 
                  <strong style={{ color: (side === "sell" ? ((longPosition?.avg_cost ?? 0) <= stock.price) : estimatedShortPnl >= 0) ? "var(--up)" : "var(--down)", marginLeft: "4px" }}>
                    {(side === "sell" ? ((longPosition?.avg_cost ?? 0) <= stock.price) : estimatedShortPnl >= 0) ? "PROFIT" : "LOSS"}
                  </strong>.
                  Any borrowed debt will be automatically repaid.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs font-medium px-3 py-2 rounded-lg"
            style={{ background: "var(--down-dim)", color: "var(--down)" }}>
            {error}
          </p>
        )}

        {result && (
          <div className="text-xs font-medium px-3 py-2 rounded-lg space-y-0.5"
            style={{
              background: (result.realizedPnl ?? 0) >= 0 ? "var(--up-dim)" : "var(--down-dim)",
              color: (result.realizedPnl ?? 0) >= 0 ? "var(--up)" : "var(--down)",
            }}>
            <p>
              {result.side === "buy" ? "Bought" :
               result.side === "sell" ? "Sold" :
               result.side === "short" ? "Shorted" : "Covered"}{" "}
              {result.shares.toFixed(4)} shares at ${result.price.toFixed(2)}
              {result.leverage && result.leverage > 1 && ` @ ${result.leverage}x`}
            </p>
            {(result.side === "buy" || result.side === "short") && result.leverage && result.leverage > 1 && (
              <p>Margin: ${result.margin?.toFixed(2)} | Borrowed: ${result.borrowed?.toFixed(2)}</p>
            )}
            {result.side === "sell" && result.borrowedRepay && result.borrowedRepay > 0 && (
              <p>Gross: ${result.grossProceeds?.toFixed(2)} − Debt repay: ${result.borrowedRepay.toFixed(2)} = Net: ${result.netProceeds?.toFixed(2)}</p>
            )}
            {result.side === "cover" && (
              <p>Margin returned: ${result.marginReturned?.toFixed(2)} | Net: ${result.netProceeds?.toFixed(2)}</p>
            )}
            {result.realizedPnl != null && (
              <p>P&L: {result.realizedPnl >= 0 ? "+" : ""}${result.realizedPnl.toFixed(2)}</p>
            )}
          </div>
        )}

        <button
          onClick={executeTrade}
          disabled={loading || shares <= 0}
          className="btn btn-block btn-lg uppercase tracking-wider"
          style={{
            background: sideConfig[side].bg,
            color: sideConfig[side].color,
            border: `1px solid ${sideConfig[side].color}40`,
          }}
        >
          {loading ? "Executing..." : `${sideConfig[side].label} ${ticker}`}
        </button>
      </div>

      {/* Back to portfolio */}
      <Link
        href="/paper"
        className="btn btn-ghost btn-sm"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Portfolio
      </Link>
    </div>
  );
}
