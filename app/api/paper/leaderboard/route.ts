import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdmin();

  // Get current user (optional — for "my rank")
  let currentUserId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch {
    // not logged in — that's fine
  }

  // Parse page param
  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  // Get all paper accounts
  const { data: accounts } = await admin
    .from("paper_accounts")
    .select("user_id, cash_balance");

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      entries: [],
      myRank: null,
      totalCount: 0,
      page: 1,
      totalPages: 1,
    });
  }

  // Get all positions (service role bypasses RLS)
  const { data: allPositions } = await admin
    .from("paper_positions")
    .select("user_id, ticker, shares, avg_cost, side, leverage, borrowed");

  // Get current prices for all tickers
  const tickers = [...new Set((allPositions ?? []).map((p: { ticker: string }) => p.ticker))];
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await admin
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

        // Effective leverage: marketValue / equity (dynamic, price-sensitive)
        const effectiveLeverage = borrowed > 0 && equity > 0
          ? Math.round((marketValue / equity) * 10) / 10
          : 1;

        return {
          ticker: p.ticker,
          side: p.side ?? "long",
          leverage: effectiveLeverage,
          equity,
          marketValue,
        };
      }
    );

    const totalEquity = positionsEnriched.reduce(
      (sum: number, p: { equity: number }) => sum + p.equity, 0
    );
    const totalValue = acc.cash_balance + totalEquity;
    const returnPct = ((totalValue - 1000) / 1000) * 100;

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

  // Add ranks to all entries
  const allRanked = leaderboard.map(
    (entry: {
      userId: string; totalValue: number; returnPct: number;
      positionCount: number;
      positions: { ticker: string; side: string; leverage: number; allocationPct: number }[];
    }, i: number) => ({
      rank: i + 1,
      ...entry,
    })
  );

  // Find current user's rank
  const myRank = currentUserId
    ? allRanked.find((e: { userId: string }) => e.userId === currentUserId) ?? null
    : null;

  // Paginate
  const totalCount = allRanked.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const entries = allRanked.slice(start, start + PAGE_SIZE);

  return NextResponse.json({
    entries,
    myRank,
    totalCount,
    page: safePage,
    totalPages,
  }, {
    headers: { "Cache-Control": "s-maxage=30" },
  });
}
