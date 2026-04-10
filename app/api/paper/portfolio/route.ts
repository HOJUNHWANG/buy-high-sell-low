import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auto-create account if missing
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance, streak, nickname, last_checkin, status")
    .eq("user_id", user.id)
    .single();

  let cashBalance = 1000;
  if (!account) {
    await supabase.from("paper_accounts").insert({ user_id: user.id, cash_balance: 1000 });
  } else {
    cashBalance = account.cash_balance;
  }

  // Single query: positions joined with current prices and stock info
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("*, stock_prices(price), stocks(name, logo_url)")
    .eq("user_id", user.id)
    .gt("shares", 0);

  // Build enriched positions
  const enrichedPositions = (positions ?? []).map((p: any) => {
    const currentPrice = p.stock_prices?.price ?? p.avg_cost;
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
      stock_prices: undefined,
      stocks: undefined,
      side: p.side ?? "long",
      name: p.stocks?.name ?? p.ticker,
      logo_url: p.stocks?.logo_url ?? null,
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
    streak: account?.streak ?? 0,
    lastCheckin: account?.last_checkin ?? null,
    status: account?.status ?? "active",
  });
}
