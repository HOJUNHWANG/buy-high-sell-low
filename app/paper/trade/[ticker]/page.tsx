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
}

interface TradeResult {
  ok: boolean;
  side: string;
  shares: number;
  price: number;
  total: number;
  cashBalance: number;
  newAchievements: string[];
  realizedPnl?: number;
}

export default function TradePage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params);
  const ticker = rawTicker.toUpperCase();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [cashBalance, setCashBalance] = useState(0);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [inputMode, setInputMode] = useState<"shares" | "dollars">("dollars");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth/login");
      else setAuthed(true);
    });
  }, [supabase, router]);

  useEffect(() => {
    if (!authed) return;

    // Fetch stock info, current price, and portfolio in parallel
    Promise.all([
      fetch(`/api/search?q=${ticker}`).then((r) => r.json()),
      fetch("/api/paper/portfolio").then((r) => r.json()),
      supabase.from("stock_prices").select("price, change_pct").eq("ticker", ticker).single(),
    ]).then(([searchResults, portfolio, { data: priceData }]) => {
      const matched = searchResults.find((s: { ticker: string }) => s.ticker === ticker);
      if (!matched) return;

      const pos = portfolio.positions?.find((p: { ticker: string }) => p.ticker === ticker);
      const currentPrice = priceData?.price ?? pos?.currentPrice ?? 0;

      setStock({
        ticker: matched.ticker,
        name: matched.name,
        logo_url: matched.logo_url,
        price: currentPrice,
        change_pct: priceData?.change_pct ?? null,
      });

      if (pos) {
        setPosition({
          shares: pos.shares,
          avg_cost: pos.avg_cost,
          pnl: pos.pnl,
          pnlPct: pos.pnlPct,
          marketValue: pos.marketValue,
        });
      }
      setCashBalance(portfolio.cashBalance);
    });
  }, [authed, ticker, supabase]);

  const shares = inputMode === "shares"
    ? parseFloat(inputValue) || 0
    : stock?.price ? (parseFloat(inputValue) || 0) / stock.price : 0;
  const estimatedTotal = stock ? shares * stock.price : 0;

  async function executeTrade() {
    setError("");
    setResult(null);
    if (shares <= 0) { setError("Enter a valid amount"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/paper/${side}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, shares }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data);
      setCashBalance(data.cashBalance);
      setInputValue("");

      // Refresh position
      const portfolioRes = await fetch("/api/paper/portfolio");
      if (portfolioRes.ok) {
        const portfolio = await portfolioRes.json();
        const pos = portfolio.positions?.find((p: { ticker: string }) => p.ticker === ticker);
        setPosition(pos ? {
          shares: pos.shares,
          avg_cost: pos.avg_cost,
          pnl: pos.pnl,
          pnlPct: pos.pnlPct,
          marketValue: pos.marketValue,
        } : null);
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

      {/* Current position */}
      {position && (
        <div className="card rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-3)" }}>
            Your Position
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Shares</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {position.shares.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Avg Cost</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                ${position.avg_cost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>P&L</p>
              <p className="text-sm font-semibold tabular-nums"
                style={{ color: position.pnl >= 0 ? "var(--up)" : "var(--down)" }}>
                {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade form */}
      <div className="card rounded-xl p-5 space-y-4">
        {/* Buy/Sell tabs */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSide(s); setResult(null); setError(""); }}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-all"
              style={{
                background: side === s
                  ? (s === "buy" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)")
                  : "transparent",
                color: side === s
                  ? (s === "buy" ? "var(--up)" : "var(--down)")
                  : "var(--text-3)",
              }}
            >
              {s}
            </button>
          ))}
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
            {side === "sell" && position ? ` | ${position.shares.toFixed(4)} shares` : ""}
          </p>
        </div>

        {/* Order summary */}
        {shares > 0 && (
          <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--surface-2)" }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--text-3)" }}>Shares</span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>{shares.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--text-3)" }}>Price</span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>${stock.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold pt-1"
              style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-2)" }}>Estimated {side === "buy" ? "Cost" : "Proceeds"}</span>
              <span className="tabular-nums" style={{ color: "var(--text)" }}>${estimatedTotal.toFixed(2)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs font-medium px-3 py-2 rounded-lg"
            style={{ background: "var(--down-dim)", color: "var(--down)" }}>
            {error}
          </p>
        )}

        {result && (
          <div className="text-xs font-medium px-3 py-2 rounded-lg"
            style={{ background: "var(--up-dim)", color: "var(--up)" }}>
            {result.side === "buy" ? "Bought" : "Sold"} {result.shares.toFixed(4)} shares at ${result.price.toFixed(2)} (${result.total.toFixed(2)})
            {result.realizedPnl != null && (
              <span> | P&L: {result.realizedPnl >= 0 ? "+" : ""}${result.realizedPnl.toFixed(2)}</span>
            )}
            {result.newAchievements.length > 0 && (
              <span className="block mt-1">New badge: {result.newAchievements.join(", ")}</span>
            )}
          </div>
        )}

        <button
          onClick={executeTrade}
          disabled={loading || shares <= 0}
          className={`btn btn-block btn-lg uppercase tracking-wider ${side === "buy" ? "btn-success" : "btn-danger"}`}
        >
          {loading ? "Executing..." : `${side} ${ticker}`}
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
