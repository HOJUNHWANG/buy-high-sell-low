import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  // Get all paper accounts
  const { data: accounts } = await supabase
    .from("paper_accounts")
    .select("user_id, cash_balance");

  if (!accounts || accounts.length === 0) {
    return NextResponse.json([]);
  }

  // Get all positions
  const { data: allPositions } = await supabase
    .from("paper_positions")
    .select("user_id, ticker, shares");

  // Get current prices for all tickers in positions
  const tickers = [...new Set((allPositions ?? []).map((p: { ticker: string }) => p.ticker))];
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    prices = Object.fromEntries((priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
  }

  // Calculate portfolio values
  const leaderboard = accounts.map((acc: { user_id: string; cash_balance: number }) => {
    const userPositions = (allPositions ?? []).filter((p: { user_id: string }) => p.user_id === acc.user_id);
    const positionValue = userPositions.reduce(
      (sum: number, p: { ticker: string; shares: number }) => sum + p.shares * (prices[p.ticker] ?? 0),
      0
    );
    const totalValue = acc.cash_balance + positionValue;
    const returnPct = ((totalValue - 1000) / 1000) * 100;

    return {
      userId: acc.user_id,
      totalValue,
      returnPct,
      positionCount: userPositions.length,
    };
  });

  // Sort by return % descending
  leaderboard.sort((a: { returnPct: number }, b: { returnPct: number }) => b.returnPct - a.returnPct);

  // Add rank
  const ranked = leaderboard.slice(0, 50).map((entry: { userId: string; totalValue: number; returnPct: number; positionCount: number }, i: number) => ({
    rank: i + 1,
    ...entry,
  }));

  return NextResponse.json(ranked, {
    headers: { "Cache-Control": "s-maxage=300" },
  });
}
