import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createSupabaseAdmin();

  // Get all paper accounts
  const { data: accounts } = await supabase
    .from("paper_accounts")
    .select("user_id, cash_balance");

  if (!accounts || accounts.length === 0) {
    return NextResponse.json([]);
  }

  // Get all positions (service role bypasses RLS)
  const { data: allPositions } = await supabase
    .from("paper_positions")
    .select("user_id, ticker, shares, avg_cost, side, leverage, borrowed");

  // Get current prices for all tickers
  const tickers = [...new Set((allPositions ?? []).map((p: { ticker: string }) => p.ticker))];
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    prices = Object.fromEntries(
      (priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
    );
  }

  // Calculate portfolio values with equity (debt subtracted)
  const leaderboard = accounts.map((acc: { user_id: string; cash_balance: number }) => {
    const userPositions = (allPositions ?? []).filter(
      (p: { user_id: string }) => p.user_id === acc.user_id
    );

    // Calculate equity per position (same logic as portfolio API)
    const positionsEnriched = userPositions.map(
      (p: { ticker: string; shares: number; avg_cost: number; side?: string; leverage?: number; borrowed?: number }) => {
        const currentPrice = prices[p.ticker] ?? p.avg_cost;
        const isShort = p.side === "short";
        const marketValue = p.shares * currentPrice;
        const costBasis = p.shares * p.avg_cost;
        const borrowed = p.borrowed ?? 0;
        const marginUsed = costBasis - borrowed;

        let equity: number;
        if (isShort) {
          const pnl = (p.avg_cost - currentPrice) * p.shares;
          equity = marginUsed + pnl;
        } else {
          equity = marketValue - borrowed;
        }

        return {
          ticker: p.ticker,
          side: p.side ?? "long",
          leverage: p.leverage ?? 1,
          equity,
          marketValue,
        };
      }
    );

    const totalEquity = positionsEnriched.reduce(
      (sum: number, p: { equity: number }) => sum + p.equity,
      0
    );
    const totalValue = acc.cash_balance + totalEquity;
    const returnPct = ((totalValue - 1000) / 1000) * 100;

    // Calculate allocation % based on total portfolio value
    const positions = positionsEnriched.map(
      (p: { ticker: string; side: string; leverage: number; equity: number; marketValue: number }) => ({
        ticker: p.ticker,
        side: p.side,
        leverage: p.leverage,
        allocationPct: totalValue > 0 ? (Math.abs(p.equity) / totalValue) * 100 : 0,
      })
    ).sort(
      (a: { allocationPct: number }, b: { allocationPct: number }) => b.allocationPct - a.allocationPct
    );

    return {
      userId: acc.user_id,
      totalValue,
      returnPct,
      positionCount: userPositions.length,
      positions,
    };
  });

  // Sort by return % descending
  leaderboard.sort(
    (a: { returnPct: number }, b: { returnPct: number }) => b.returnPct - a.returnPct
  );

  // Add rank, limit to top 50
  const ranked = leaderboard.slice(0, 50).map(
    (entry: {
      userId: string;
      totalValue: number;
      returnPct: number;
      positionCount: number;
      positions: { ticker: string; side: string; leverage: number; allocationPct: number }[];
    }, i: number) => ({
      rank: i + 1,
      ...entry,
    })
  );

  return NextResponse.json(ranked, {
    headers: { "Cache-Control": "s-maxage=30" },
  });
}
