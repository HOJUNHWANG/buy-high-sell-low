"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { WhatIfScenario } from "@/lib/types";
import { useAdBlocked } from "@/components/AdBlockDetector";

interface SearchResult {
  ticker: string;
  name: string;
  logo_url: string | null;
}

interface WhatIfResult {
  ticker: string;
  buyDate: string;
  sellDate: string | null;
  stillHolding: boolean;
  buyPrice: number;
  sellPrice: number;
  shares: number;
  investedAmount: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  spyComparison: { pnlPct: number } | null;
  chartData: { date: string; price: number }[];
}

const NIHILISTIC_MESSAGES = [
  "But none of this matters. You didn't buy it. You never do.",
  "Time in the market beats timing the market. Unless you're you.",
  "At least you still have your health... right?",
  "Past performance doesn't guarantee future results. But yours is still painful.",
  "The best time to invest was 20 years ago. The second best time was not when you did it.",
  "Hindsight is 20/20. Your portfolio is not.",
  "Don't worry. Everyone's a genius in a simulation.",
  "This is why they invented index funds.",
  "Somewhere in a parallel universe, you actually made this trade. That version of you is doing great.",
  "Fun fact: regret burns zero calories.",
];

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export default function WhatIfPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const adBlocked = useAdBlocked();
  const chartRef = useRef<HTMLDivElement>(null);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [ticker, setTicker] = useState("");
  const [tickerName, setTickerName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [buyDate, setBuyDate] = useState("");
  const [sellDate, setSellDate] = useState("");
  const [stillHolding, setStillHolding] = useState(true);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [nihilism, setNihilism] = useState("");
  const [savedScenarios, setSavedScenarios] = useState<WhatIfScenario[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth/login");
      else setAuthed(true);
    });
  }, [supabase, router]);

  // Load saved scenarios
  const loadScenarios = useCallback(async () => {
    const res = await fetch("/api/whatif");
    if (res.ok) setSavedScenarios(await res.json());
  }, []);

  useEffect(() => {
    if (authed) loadScenarios();
  }, [authed, loadScenarios]);

  // Fetch date range when ticker changes
  useEffect(() => {
    if (!ticker) { setMinDate(""); setMaxDate(""); return; }
    fetch(`/api/whatif/date-range?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setMinDate(data.minDate);
          setMaxDate(data.maxDate);
        }
      });
  }, [ticker]);

  // Search stocks
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&exclude_sector=ETF`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Draw chart when result changes
  useEffect(() => {
    if (!result || !chartRef.current || result.chartData.length === 0) return;
    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]> | null = null;

    async function drawChart() {
      const { createChart, ColorType, AreaSeries } = await import("lightweight-charts");
      if (!chartRef.current || !result) return;

      const isUp = result.pnlPct >= 0;
      const color = isUp ? "#4ade80" : "#f87171";

      chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 240,
        layout: { background: { type: ColorType.Solid, color: "#0f0f0f" }, textColor: "#555" },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.02)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
        timeScale: { borderColor: "rgba(255,255,255,0.06)", fixLeftEdge: true, fixRightEdge: true },
      });

      const series = chart.addSeries(AreaSeries, {
        lineColor: color,
        topColor: `${color}28`,
        bottomColor: `${color}00`,
        lineWidth: 2,
        priceLineVisible: false,
      });

      const points = result.chartData.map((d) => ({
        time: d.date as string,
        value: d.price,
      }));

      series.setData(points as Parameters<typeof series.setData>[0]);
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chart && chartRef.current)
          chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    drawChart();
    return () => { chart?.remove(); };
  }, [result]);

  async function calculate() {
    setError("");
    setResult(null);
    setSaved(false);

    if (!ticker || !buyDate || !amount || parseFloat(amount) <= 0) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          buyDate,
          sellDate: stillHolding ? null : sellDate || null,
          amount: parseFloat(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }
      setResult(data);
      setNihilism(NIHILISTIC_MESSAGES[Math.floor(Math.random() * NIHILISTIC_MESSAGES.length)]);
    } catch {
      setError("Failed to calculate. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveScenario() {
    if (!result) return;
    const res = await fetch("/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        buyDate,
        sellDate: stillHolding ? null : sellDate || null,
        amount: parseFloat(amount),
        save: true,
      }),
    });
    if (res.ok) {
      setSaved(true);
      loadScenarios();
    }
  }

  async function deleteScenario(id: number) {
    await fetch(`/api/whatif?id=${id}`, { method: "DELETE" });
    loadScenarios();
  }

  if (authed === null) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-20 text-center">
        <div className="skeleton h-8 w-48 mx-auto mb-4" />
        <div className="skeleton h-4 w-64 mx-auto" />
      </div>
    );
  }

  if (adBlocked) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center fade-up">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="mx-auto mb-4" style={{ color: "var(--text-3)" }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
          What If Calculator Locked
        </h1>
        <p className="text-sm mb-1" style={{ color: "var(--text-2)" }}>
          This feature requires ads to stay free.
        </p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          Please disable your ad blocker and refresh to access the What If calculator.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-6 fade-up">
      {/* Hero */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          What If<span style={{ color: "var(--accent)" }}>?</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          For those who want to curse their past decisions...
        </p>
      </div>

      {/* Input form */}
      <div className="card rounded-xl p-5 space-y-4">
        {/* Stock picker */}
        <div className="relative">
          <label className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 block"
            style={{ color: "var(--text-3)" }}>
            Stock
          </label>
          <input
            type="text"
            placeholder="Search ticker or company..."
            value={ticker ? `${ticker} — ${tickerName}` : searchQuery}
            onChange={(e) => {
              setTicker("");
              setTickerName("");
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            className="input"
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-md)" }}>
              {searchResults.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => {
                    setTicker(s.ticker);
                    setTickerName(s.name);
                    setSearchQuery("");
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: "var(--text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="font-medium" style={{ color: "var(--accent)" }}>{s.ticker}</span>
                  <span style={{ color: "var(--text-2)" }}>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range hint */}
        {minDate && maxDate && (
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            Data available: {minDate} ~ {maxDate}
          </p>
        )}

        {/* Date + Amount row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 block"
              style={{ color: "var(--text-3)" }}>
              Buy Date
            </label>
            <input
              type="date"
              value={buyDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setBuyDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 block"
              style={{ color: "var(--text-3)" }}>
              Amount ($)
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Sell date */}
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-3)" }}>
              Sell Date
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-2)" }}>
              <input
                type="checkbox"
                checked={stillHolding}
                onChange={(e) => setStillHolding(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Still holding
            </label>
          </div>
          {!stillHolding && (
            <input
              type="date"
              value={sellDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setSellDate(e.target.value)}
              className="input"
            />
          )}
        </div>

        {error && (
          <p className="text-xs font-medium px-3 py-2 rounded-lg"
            style={{ background: "var(--down-dim)", color: "var(--down)" }}>
            {error}
          </p>
        )}

        <button
          onClick={calculate}
          disabled={loading}
          className="btn btn-primary btn-block btn-lg"
        >
          {loading ? "Calculating your regret..." : "Calculate My Regret"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="card rounded-xl overflow-hidden fade-up">
          {/* Hero verdict */}
          <div className="p-6 text-center space-y-2" style={{
            background: result.pnl >= 0
              ? "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))"
              : "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))",
          }}>
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              {result.stillHolding ? "If you still held" : "If you had bought"} {result.ticker} on {result.buyDate}...
            </p>
            <p className="text-3xl sm:text-4xl font-extrabold tabular-nums" style={{
              color: result.pnl >= 0 ? "var(--up)" : "var(--down)",
            }}>
              {result.pnl >= 0
                ? `You'd be up ${formatMoney(result.pnl)}`
                : `You'd have lost ${formatMoney(Math.abs(result.pnl))}`}
            </p>
            <p className="text-lg font-semibold tabular-nums" style={{
              color: result.pnlPct >= 0 ? "var(--up)" : "var(--down)",
            }}>
              {result.pnlPct >= 0 ? "+" : ""}{result.pnlPct.toFixed(1)}% return
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {formatMoney(result.investedAmount)} invested → {formatMoney(result.currentValue)} {result.stillHolding ? "today" : `on ${result.sellDate}`}
            </p>
          </div>

          {/* Detail stats */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Invested", value: formatMoney(result.investedAmount), color: "var(--text)" },
                { label: result.stillHolding ? "Worth Now" : "Final Value", value: formatMoney(result.currentValue), color: "var(--text)" },
                { label: "Shares", value: result.shares >= 1 ? result.shares.toFixed(2) : result.shares.toFixed(4), color: "var(--text)" },
                { label: "Return", value: `${result.pnlPct >= 0 ? "+" : ""}${result.pnlPct.toFixed(1)}%`, color: result.pnlPct >= 0 ? "var(--up)" : "var(--down)" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--text-3)" }}>
                    {stat.label}
                  </p>
                  <p className="text-base font-bold tabular-nums" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1" style={{ color: "var(--text-2)" }}>
              <p>${result.buyPrice.toFixed(2)} → ${result.sellPrice.toFixed(2)} per share</p>
              {result.spyComparison && (
                <p className="rounded-lg px-3 py-2 mt-2" style={{ background: "var(--surface-2)" }}>
                  <span style={{ color: "var(--text-3)" }}>If you put the same {formatMoney(result.investedAmount)} in S&amp;P 500 (SPY):{" "}</span>
                  <span style={{ color: result.spyComparison.pnlPct >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>
                    {result.spyComparison.pnlPct >= 0 ? "+" : ""}{result.spyComparison.pnlPct.toFixed(1)}%
                  </span>
                  <span style={{ color: "var(--text-3)" }}>
                    {" "}({formatMoney(result.investedAmount * (1 + result.spyComparison.pnlPct / 100))})
                    {" — "}
                    {result.pnlPct > result.spyComparison.pnlPct
                      ? "You beat the market!"
                      : result.pnlPct < result.spyComparison.pnlPct
                        ? "SPY would've done better."
                        : "Exactly the same!"}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Chart */}
          {result.chartData.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <div ref={chartRef} className="w-full" />
            </div>
          )}

          {/* Nihilistic message */}
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <p className="text-sm italic text-center" style={{ color: "var(--text-3)" }}>
              &ldquo;{nihilism}&rdquo;
            </p>
          </div>

          {/* Save button */}
          <div className="px-5 py-3 flex justify-end" style={{ borderTop: "1px solid var(--border)" }}>
            {saved ? (
              <span className="text-xs font-medium" style={{ color: "var(--up)" }}>
                Saved to My Regrets
              </span>
            ) : (
              <button
                onClick={saveScenario}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}
              >
                Save to My Regrets
              </button>
            )}
          </div>
        </div>
      )}

      {/* My Regrets */}
      {savedScenarios.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-3)" }}>
            My Regrets ({savedScenarios.length})
          </h2>
          <div className="space-y-2">
            {savedScenarios.map((s) => (
              <div key={s.id} className="card rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                      {s.ticker}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>
                      ${Number(s.amount_usd).toLocaleString()} on {s.buy_date}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                    {s.sell_date ? `Sold ${s.sell_date}` : "Still holding (hypothetically)"}
                  </p>
                </div>
                <button
                  onClick={() => deleteScenario(s.id)}
                  className="text-xs px-2 py-1 rounded shrink-0 transition-colors"
                  style={{ color: "var(--down)", background: "var(--down-dim)" }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
