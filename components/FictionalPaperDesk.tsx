"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fictionalCompanies } from "@/data/fictional-market";
import { FictionalTickerMark } from "@/components/FictionalTickerMark";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import {
  FICTIONAL_STARTING_CASH, isFictionalQuoteFresh,
  type FictionalOrder, type FictionalPortfolio, type FictionalRanking, type FictionalTransaction,
} from "@/lib/fictional-paper";

const money = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const quantity = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 8 });
const tone = (value: number | null) => value === null ? "var(--text-3)" : value >= 0 ? "var(--up)" : "var(--down)";
const companies = new Map(fictionalCompanies.map((company) => [company.ticker, company]));

export function FictionalPaperDesk({ initialTicker }: { initialTicker?: string }) {
  const [portfolio, setPortfolio] = useState<FictionalPortfolio | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [ticker, setTicker] = useState(companies.has(initialTicker ?? "") ? initialTicker! : fictionalCompanies[0].ticker);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [unit, setUnit] = useState<"dollars" | "shares" | "all">("dollars");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [lastTrade, setLastTrade] = useState<FictionalTransaction | null>(null);
  const [tab, setTab] = useState<"holdings" | "history" | "rankings">("holdings");
  const [transactions, setTransactions] = useState<FictionalTransaction[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [rankings, setRankings] = useState<FictionalRanking[]>([]);
  const [rankError, setRankError] = useState("");
  const [myRank, setMyRank] = useState<number | null>(null);
  const [rankLoaded, setRankLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Keep the same request ID after an uncertain network outcome. A retry must
  // retrieve the committed trade rather than execute it twice.
  const pending = useRef<FictionalOrder | null>(null);
  const [pendingOrder, setPendingOrder] = useState<FictionalOrder | null>(null);
  const sending = useRef(false);

  const loadPortfolio = useCallback(async () => {
    try {
      const response = await fetch("/api/fictional-paper/portfolio", { cache: "no-store" });
      if (response.status === 401) { setAuthRequired(true); setPortfolio(null); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Portfolio unavailable.");
      setAuthRequired(false); setPortfolio(data); setError(""); setNow(Date.now());
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load portfolio."); }
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/fictional-paper/transactions?page=${page}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "History unavailable.");
      setTransactions((previous) => page === 1 ? data.transactions : [...previous, ...data.transactions]);
      setHistoryPage(page); setHasMore(data.hasMore); setHistoryError("");
    } catch (failure) { setHistoryError(failure instanceof Error ? failure.message : "Unable to load history."); }
    finally { setHistoryBusy(false); }
  }, []);

  const loadRankings = useCallback(async () => {
    try {
      const response = await fetch("/api/fictional-paper/leaderboard", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Rankings unavailable.");
      setRankings(data.entries); setMyRank(data.myRank); setRankError(""); setRankLoaded(true);
    } catch (failure) { setRankError(failure instanceof Error ? failure.message : "Unable to load rankings."); }
  }, []);

  useEffect(() => {
    void loadPortfolio();
    const interval = window.setInterval(() => { setNow(Date.now()); void loadPortfolio(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadPortfolio]);

  useEffect(() => {
    if (tab === "history" && !authRequired) void loadHistory(1);
    if (tab === "rankings") void loadRankings();
  }, [tab, authRequired, loadHistory, loadRankings]);

  const company = companies.get(ticker)!;
  const quote = portfolio?.quotes.find((row) => row.ticker === ticker);
  const holding = portfolio?.positions.find((row) => row.ticker === ticker);
  const price = quote?.price ?? null;
  const fresh = isFictionalQuoteFresh(quote, now);
  const numericAmount = Number(amount);
  const estimatedShares = unit === "all" ? holding?.shares ?? 0
    : unit === "shares" ? numericAmount : price ? numericAmount / price : 0;
  const estimatedTotal = price === null ? 0 : estimatedShares * price;
  const validAmount = Number.isFinite(estimatedShares) && estimatedShares > 0 && estimatedTotal >= 0.01;
  const affordable = side === "buy" ? estimatedTotal <= (portfolio?.cashBalance ?? 0) + 1e-8 : estimatedShares <= (holding?.shares ?? 0) + 1e-8;

  function changeOrder(change: () => void) {
    if (busy || pending.current) return;
    change(); setTradeError(""); setLastTrade(null);
  }

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const order = pending.current ?? { ticker, side, unit, amount: unit === "all" ? 0 : numericAmount, requestId: crypto.randomUUID() };
    pending.current = order;
    setPendingOrder(order);
    setBusy(true); setTradeError(""); setLastTrade(null);
    try {
      const response = await fetch("/api/fictional-paper/trade", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500 || String(data.code ?? "").startsWith("PT")) {
          pending.current = null; setPendingOrder(null);
        }
        throw new Error(data.error ?? "Trade could not be confirmed. Retry the same order.");
      }
      pending.current = null; setPendingOrder(null); setLastTrade(data.trade); setAmount(""); setUnit("dollars");
      await loadPortfolio();
      if (tab === "history") await loadHistory(1);
      if (tab === "rankings") await loadRankings();
    } catch (failure) { setTradeError(failure instanceof Error ? failure.message : "Trade could not be confirmed. Retry the same order."); }
    finally { sending.current = false; setBusy(false); }
  }

  const locked = busy || pendingOrder !== null;
  const card = "card rounded-xl p-5";
  const inputStyle = { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <div className="max-w-7xl mx-auto px-5 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/fictional-market" className="nav-link text-xs">← Fictional Market</Link>
        <Link href="/paper" className="nav-link text-xs">Real-market paper account →</Link>
      </div>
      <header>
        <span className="badge badge-muted">MULTIVERSE PORTFOLIO</span>
        <h1 className="text-2xl sm:text-3xl font-bold mt-3" style={{ color: "var(--text)" }}>Fictional Paper Trading</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-3)" }}>Start with {money(FICTIONAL_STARTING_CASH)} in simulated cash. Buy fractional shares, follow your returns, and climb the Fictional rankings.</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>Dedicated balance and rankings for Fictional stocks. Quotes update every 30 minutes, around the clock.</p>
      </header>
      <PaperTradeBanner />

      {authRequired && <section className={card}>
        <h2 className="text-lg font-semibold">Your multiverse portfolio starts here</h2>
        <p className="text-sm mt-2 mb-4" style={{ color: "var(--text-3)" }}>Sign in to receive your starting balance and place your first trade.</p>
        <Link href="/auth/login" className="btn-primary inline-flex px-5 py-2 rounded-lg text-sm">Sign in to trade</Link>
      </section>}
      {error && <div role="alert" className={card} style={{ color: "var(--down)" }}>{error} <button onClick={() => void loadPortfolio()} className="underline ml-2">Retry</button></div>}
      {!portfolio && !authRequired && !error && <div className="skeleton h-32 rounded-xl" aria-label="Loading portfolio" />}

      {portfolio && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[["Portfolio value", portfolio.totalValue], ["Available cash", portfolio.cashBalance], ["Holdings value", portfolio.totalMarketValue], ["Total return", portfolio.totalPnl]].map(([label, value]) => (
            <section key={label as string} className="card rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{label}</p>
              <p className="text-xl sm:text-2xl font-bold mt-2 tabular-nums" style={{ color: label === "Total return" ? tone(value as number | null) : "var(--text)" }}>{money(value as number | null)}</p>
              {label === "Total return" && portfolio.totalPnlPct !== null && <p className="text-xs mt-1" style={{ color: tone(portfolio.totalPnl) }}>{portfolio.totalPnlPct >= 0 ? "+" : ""}{portfolio.totalPnlPct.toFixed(2)}%</p>}
            </section>
          ))}
        </div>
        {portfolio.totalValue === null && <p role="status" className="text-xs" style={{ color: "var(--text-3)" }}>Some holding prices are unavailable. Totals will return when quotes recover.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <section className={`${card} order-2 lg:order-1 overflow-hidden`}>
            <div className="flex gap-5 mb-5 border-b pb-3" style={{ borderColor: "var(--border)" }}>
              {(["holdings", "history", "rankings"] as const).map((view) => <button key={view} onClick={() => setTab(view)} aria-pressed={tab === view} className="text-sm font-semibold capitalize" style={{ color: tab === view ? "var(--accent)" : "var(--text-3)" }}>{view}</button>)}
            </div>
            {tab === "holdings" && <>
              {!portfolio.positions.length && <div className="py-12 text-center"><p className="font-semibold">Your first investment awaits</p><p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>Choose a company and buy as little as $1 of its shares.</p></div>}
              <div className="space-y-4">{portfolio.positions.map((position) => {
                const stock = companies.get(position.ticker);
                return <div key={position.ticker} className="flex flex-wrap items-center gap-3 border-b pb-4 last:border-0" style={{ borderColor: "var(--border)" }}>
                  <FictionalTickerMark ticker={position.ticker} color={stock?.color ?? "#6353af"} accent={stock?.accent ?? "#b8acdf"} size="sm" />
                  <div className="flex-1 min-w-[110px]"><Link href={`/fictional-market/${position.ticker}`} className="text-sm font-semibold">{position.ticker}</Link><p className="text-[11px]" style={{ color: "var(--text-3)" }}>{quantity(position.shares)} shares · avg {money(position.avg_cost)}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold">{money(position.marketValue)}</p><p className="text-xs" style={{ color: tone(position.pnl) }}>{money(position.pnl)}{position.pnlPct !== null ? ` (${position.pnlPct >= 0 ? "+" : ""}${position.pnlPct.toFixed(1)}%)` : ""}</p></div>
                  <button disabled={locked} className="text-xs rounded-lg px-3 py-2 disabled:opacity-40" style={inputStyle} onClick={() => changeOrder(() => { setTicker(position.ticker); setSide("sell"); setUnit("all"); setAmount(""); })}>Sell</button>
                </div>;
              })}</div>
            </>}
            {tab === "history" && <>
              {historyError && <p role="alert" className="text-sm" style={{ color: "var(--down)" }}>{historyError} <button className="underline" onClick={() => void loadHistory(1)}>Retry</button></p>}
              {!transactions.length && <p className="text-sm py-10 text-center" style={{ color: "var(--text-3)" }}>{historyBusy ? "Loading trades…" : "Your completed trades will appear here."}</p>}
              <div className="space-y-4">{transactions.map((trade) => <div key={trade.id} className="flex flex-wrap items-center justify-between gap-2 text-xs border-b pb-3 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div><p className="font-semibold"><span style={{ color: trade.side === "buy" ? "var(--up)" : "var(--down)" }}>{trade.side.toUpperCase()}</span> <Link href={`/fictional-market/${trade.ticker}`}>{trade.ticker}</Link></p><p className="mt-1" style={{ color: "var(--text-3)" }}>{quantity(trade.shares)} shares at {money(trade.price)} · {new Date(trade.executed_at).toLocaleString()}</p></div>
                <div className="text-right"><p className="font-semibold">{money(trade.total)}</p>{trade.side === "sell" && <p style={{ color: tone(trade.realized_pnl) }}>Realized {money(trade.realized_pnl)}</p>}</div>
              </div>)}</div>
              {hasMore && <button disabled={historyBusy} className="mt-4 text-xs underline" onClick={() => void loadHistory(historyPage + 1)}>{historyBusy ? "Loading…" : "Load more trades"}</button>}
            </>}
            {tab === "rankings" && <>
              <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>Top 50 Fictional investors{myRank ? ` · Your rank: #${myRank}` : " · Place a trade to join"}</p>
              {rankError && <p role="alert" className="text-sm" style={{ color: "var(--down)" }}>{rankError} <button className="underline" onClick={() => void loadRankings()}>Retry</button></p>}
              {!rankings.length && !rankError && <p className="text-sm py-10 text-center" style={{ color: "var(--text-3)" }}>{rankLoaded ? "Be the first Fictional investor on the board." : "Loading rankings…"}</p>}
              <div className="space-y-3">{rankings.map((entry) => <div key={entry.rank} className="flex items-center gap-3 text-sm rounded-lg px-3 py-3" style={{ background: entry.isMe ? "var(--accent-dim)" : "var(--surface)" }}><span className="w-6 font-bold" style={{ color: "var(--accent)" }}>#{entry.rank}</span><span className="flex-1">{entry.name}{entry.isMe ? " (you)" : ""}</span><div className="text-right"><p className="font-semibold">{money(entry.totalValue)}</p><p className="text-xs" style={{ color: tone(entry.pnl) }}>{entry.pnlPct >= 0 ? "+" : ""}{entry.pnlPct.toFixed(2)}%</p></div></div>)}</div>
            </>}
          </section>

          <form onSubmit={submitOrder} className={`${card} order-1 lg:order-2 space-y-4`}>
            <div className="flex items-center gap-3"><FictionalTickerMark ticker={ticker} color={company.color} accent={company.accent} /><div className="min-w-0"><h2 className="font-semibold">Trade Fictional stocks</h2><p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{company.name}</p></div></div>
            <label className="block text-xs space-y-2"><span>Company</span><select aria-label="Company" disabled={locked} value={ticker} onChange={(event) => changeOrder(() => { setTicker(event.target.value); setAmount(""); setUnit("dollars"); })} className="w-full rounded-lg p-2.5 text-sm" style={inputStyle}>{fictionalCompanies.map((stock) => <option value={stock.ticker} key={stock.ticker}>{stock.ticker} · {stock.name}</option>)}</select></label>
            <div><p className="text-3xl font-bold">{money(price)}</p><p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{quote ? `Quote as of ${new Date(quote.fetched_at).toLocaleString()}` : "Waiting for a stored quote"}</p></div>
            <div className="grid grid-cols-2 gap-2">{(["buy", "sell"] as const).map((value) => <button key={value} type="button" disabled={locked} aria-pressed={side === value} onClick={() => changeOrder(() => { setSide(value); setUnit("dollars"); setAmount(""); })} className="rounded-lg py-2 text-sm font-bold uppercase" style={{ border: "1px solid var(--border)", color: side === value ? "var(--text)" : "var(--text-3)", background: side === value ? "var(--accent-dim)" : "transparent" }}>{value}</button>)}</div>
            <div className="flex gap-3 text-xs">{(["dollars", "shares"] as const).map((value) => <button key={value} type="button" disabled={locked} aria-pressed={unit === value} onClick={() => changeOrder(() => { setUnit(value); setAmount(""); })} className="capitalize" style={{ color: unit === value ? "var(--accent)" : "var(--text-3)" }}>{value}</button>)}{side === "sell" && <button type="button" disabled={locked || !holding} onClick={() => changeOrder(() => { setUnit("all"); setAmount(""); })} style={{ color: unit === "all" ? "var(--accent)" : "var(--text-3)" }}>Sell all</button>}</div>
            {unit !== "all" ? <label className="block text-xs space-y-2"><span>{unit === "dollars" ? "Amount (USD)" : "Number of shares"}</span><input disabled={locked} required type="number" min="0.00000001" step="any" inputMode="decimal" value={amount} onChange={(event) => changeOrder(() => setAmount(event.target.value))} placeholder={unit === "dollars" ? "100.00" : "1.00"} className="w-full rounded-lg p-3 text-lg" style={inputStyle} /></label> : <p className="text-sm py-2">Sell all {quantity(holding?.shares ?? 0)} shares</p>}
            {side === "buy" && <div className="flex gap-2">{[25, 50, 100].map((percent) => <button key={percent} type="button" disabled={locked} className="flex-1 rounded-lg py-1.5 text-xs" style={inputStyle} onClick={() => changeOrder(() => { setUnit("dollars"); setAmount((Math.floor(portfolio.cashBalance * percent) / 100).toFixed(2)); })}>{percent === 100 ? "Max" : `${percent}%`}</button>)}</div>}
            <div className="space-y-1 text-xs" style={{ color: "var(--text-3)" }}><p>Available cash <span className="float-right">{money(portfolio.cashBalance)}</span></p><p>Owned <span className="float-right">{quantity(holding?.shares ?? 0)} shares</span></p><p>Estimated total <span className="float-right" style={{ color: "var(--text)" }}>{money(Number.isFinite(estimatedTotal) ? estimatedTotal : 0)}</span></p></div>
            {!fresh && <p role="status" className="text-xs" style={{ color: "var(--down)" }}>Trading paused while the quote refreshes.</p>}
            {validAmount && !affordable && <p className="text-xs" style={{ color: "var(--down)" }}>{side === "buy" ? "Insufficient available cash." : "Not enough shares to sell."}</p>}
            {tradeError && <p role="alert" className="text-xs" style={{ color: "var(--down)" }}>{tradeError}</p>}
            <button disabled={busy || (!pendingOrder && (!fresh || !validAmount || !affordable))} className="w-full rounded-lg py-3 text-sm font-bold disabled:opacity-40" style={{ background: "var(--accent)", color: "#fff" }}>{busy ? "Confirming…" : pendingOrder ? "Retry same order" : `${side === "buy" ? "Buy" : "Sell"} ${ticker}`}</button>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-3)" }}>Orders execute at the latest stored quote. Your final fill may differ from this estimate.</p>
            {lastTrade && <div role="status" className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--up-dim)", color: "var(--up)" }}><p className="font-semibold">{lastTrade.side === "buy" ? "Bought" : "Sold"} {quantity(lastTrade.shares)} {lastTrade.ticker}</p><p>{money(lastTrade.price)} per share · Total {money(lastTrade.total)}</p><p>Available cash {money(lastTrade.cash_balance_after)}</p></div>}
          </form>
        </div>
      </>}
    </div>
  );
}
