import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { runPaperAction } from "@/lib/paper-actions";
import { getPriceFreshness } from "@/lib/price-freshness";
import { isDustPosition } from "@/lib/paper-trading";
import { NextResponse } from "next/server";

type PaperPositionRow = {
  ticker: string;
  shares: number;
  avg_cost: number;
  borrowed?: number | null;
  side?: string | null;
  leverage?: number | null;
  stocks?: {
    name?: string | null;
    logo_url?: string | null;
  } | null;
};

export async function getPaperPortfolio(userId: string, supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const initialized = await runPaperAction(userId, "init");
  if (initialized.response) return initialized.response;
  const account = initialized.data;
  const cashBalance = Number(account.cash_balance);

  // Fetch positions with stock info (direct FK)
  const { data: positions, error: positionsError } = await supabase
    .from("paper_positions")
    .select("*, stocks(name, logo_url)")
    .eq("user_id", userId)
    .gt("shares", 0);

  if (positionsError) return NextResponse.json({ error: "Unable to load positions" }, { status: 503 });

  // Fetch current prices separately to avoid ambiguous join issues
  const typedPositions = (positions ?? []) as PaperPositionRow[];
  const tickers = typedPositions.map((p) => p.ticker);
  let priceMap: Record<string, number> = {};
  const quoteMap = new Map<string, { fetched_at: string | null; provider_session_date?: string | null }>();
  if (tickers.length > 0) {
    const { data: prices, error: pricesError } = await supabase
      .from("stock_prices")
      .select("ticker, price, fetched_at, provider_session_date")
      .in("ticker", tickers);
    if (pricesError) return NextResponse.json({ error: "Unable to load portfolio prices" }, { status: 503 });
    for (const q of prices ?? []) quoteMap.set(q.ticker, q);
    priceMap = ((prices ?? []) as { ticker: string; price: number }[]).reduce((acc: Record<string, number>, row) => {
      acc[row.ticker] = row.price;
      return acc;
    }, {});
  }

  // Build enriched positions
  const enrichedPositions = typedPositions.map((p) => {
    const currentPrice = priceMap[p.ticker] ?? p.avg_cost;
    const isShort = p.side === "short";
    const marketValue = p.shares * currentPrice;
    const costBasis = p.shares * p.avg_cost;
    const borrowed = p.borrowed ?? 0;
    const marginUsed = costBasis - borrowed; // what user originally put up

    let equity: number;
    let pnl: number;
    if (isShort) {
      pnl = (p.avg_cost - currentPrice) * p.shares;
      equity = marginUsed + pnl;
    } else {
      equity = marketValue - borrowed;
      pnl = equity - marginUsed;
    }
    const pnlPct = marginUsed > 0 ? (pnl / marginUsed) * 100 : 0;

    return {
      ...p,
      stocks: undefined,
      side: p.side ?? "long",
      name: p.stocks?.name ?? p.ticker,
      logo_url: p.stocks?.logo_url ?? null,
      currentPrice,
      isEstimated: !["live", "settled"].includes(getPriceFreshness(quoteMap.get(p.ticker)?.fetched_at, p.ticker, new Date(), undefined, quoteMap.get(p.ticker)?.provider_session_date).state),
      marketValue,
      costBasis,
      borrowed,
      equity,
      pnl,
      pnlPct,
      leverage: borrowed > 0 && equity > 0
        ? Math.round((marketValue / equity) * 10) / 10
        : borrowed > 0 ? p.leverage ?? 1 : 1,
    };
  }).filter((p: { shares: number; currentPrice: number }) => !isDustPosition(p.shares, p.currentPrice));

  // Calculate totals — equity differs for long vs short positions
  const totalMarketValue = enrichedPositions.reduce((sum: number, p: { marketValue: number }) => sum + p.marketValue, 0);
  const totalBorrowed = enrichedPositions.reduce((sum: number, p: { borrowed: number }) => sum + p.borrowed, 0);
  const totalEquity = enrichedPositions.reduce((sum: number, p: { equity: number }) => sum + p.equity, 0);
  const totalCostBasis = enrichedPositions.reduce((sum: number, p: { costBasis: number }) => sum + p.costBasis, 0);
  const totalValue = cashBalance + totalEquity;
  const totalPnl = totalValue - 1000;
  const totalPnlPct = (totalPnl / 1000) * 100;

  return NextResponse.json({
    cashBalance,
    nickname: account?.nickname || null,
    totalMarketValue,
    totalBorrowed,
    totalEquity,
    totalCostBasis,
    totalValue,
    valuationEstimated: enrichedPositions.some(p => p.isEstimated),
    totalPnl,
    totalPnlPct,
    positions: enrichedPositions.sort((a, b) => b.marketValue - a.marketValue),
    streak: account?.streak ?? 0,
    lastCheckin: account?.last_checkin ?? null,
    status: account?.status ?? "active",
  });
}
