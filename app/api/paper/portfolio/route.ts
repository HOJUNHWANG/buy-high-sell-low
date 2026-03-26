import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auto-create account if missing
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance, streak_count, nickname, last_checkin, status")
    .eq("user_id", user.id)
    .single();

  let cashBalance = 1000;
  if (!account) {
    await supabase.from("paper_accounts").insert({ user_id: user.id, cash_balance: 1000 });
  } else {
    cashBalance = account.cash_balance;
  }

  // Get positions with current prices
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("user_id", user.id);

  // Get current prices for held tickers
  const tickers = (positions ?? []).map((p: { ticker: string }) => p.ticker);
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    prices = Object.fromEntries((priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
  }

  // Get stock names/logos
  let stockInfo: Record<string, { name: string; logo_url: string | null }> = {};
  if (tickers.length > 0) {
    const { data: stocks } = await supabase
      .from("stocks")
      .select("ticker, name, logo_url")
      .in("ticker", tickers);
    stockInfo = Object.fromEntries(
      (stocks ?? []).map((s: { ticker: string; name: string; logo_url: string | null }) => [s.ticker, { name: s.name, logo_url: s.logo_url }])
    );
  }

  // Build enriched positions
  const enrichedPositions = (positions ?? []).map((p: { ticker: string; shares: number; avg_cost: number; borrowed?: number; leverage?: number; side?: string; created_at: string; updated_at: string }) => {
    const currentPrice = prices[p.ticker] ?? p.avg_cost;
    const isShort = p.side === "short";
    const marketValue = p.shares * currentPrice;
    const costBasis = p.shares * p.avg_cost;
    const borrowed = p.borrowed ?? 0;
    const marginUsed = costBasis - borrowed; // what user originally put up

    let equity: number;
    let pnl: number;
    if (isShort) {
      // Short: profit when price drops
      // pnl = (avg_cost - currentPrice) × shares
      pnl = (p.avg_cost - currentPrice) * p.shares;
      equity = marginUsed + pnl; // margin back + unrealized P&L
    } else {
      // Long: profit when price rises
      equity = marketValue - borrowed;
      pnl = equity - marginUsed;
    }
    const pnlPct = marginUsed > 0 ? (pnl / marginUsed) * 100 : 0;

    return {
      ...p,
      side: p.side ?? "long",
      name: stockInfo[p.ticker]?.name ?? p.ticker,
      logo_url: stockInfo[p.ticker]?.logo_url ?? null,
      currentPrice,
      marketValue,
      costBasis,
      borrowed,
      equity,
      pnl,
      pnlPct,
      leverage: borrowed > 0 && equity > 0
        ? Math.round((marketValue / equity) * 10) / 10
        : 1,
    };
  });

  // Calculate totals — equity differs for long vs short positions
  const totalMarketValue = enrichedPositions.reduce((sum: number, p: { marketValue: number }) => sum + p.marketValue, 0);
  const totalBorrowed = enrichedPositions.reduce((sum: number, p: { borrowed: number }) => sum + p.borrowed, 0);
  const totalEquity = enrichedPositions.reduce((sum: number, p: { equity: number }) => sum + p.equity, 0);
  const totalCostBasis = enrichedPositions.reduce((sum: number, p: { costBasis: number }) => sum + p.costBasis, 0);
  const totalValue = cashBalance + totalEquity;
  const totalPnl = totalValue - 1000;
  const totalPnlPct = (totalPnl / 1000) * 100;

  // Get achievements
  const { data: achievements } = await supabase
    .from("paper_achievements")
    .select("badge_key, earned_at")
    .eq("user_id", user.id);

  return NextResponse.json({
    cashBalance,
    nickname: account?.nickname || null,
    totalMarketValue,
    totalBorrowed,
    totalEquity,
    totalCostBasis,
    totalValue,
    totalPnl,
    totalPnlPct,
    positions: enrichedPositions.sort((a, b) => b.marketValue - a.marketValue),
    achievements: achievements ?? [],
    streak: account?.streak_count ?? 0,
    lastCheckin: account?.last_checkin ?? null,
    status: account?.status ?? "active",
  });
}
