import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ticker = body.ticker as string | undefined;
  const shares = body.shares;

  if (!ticker || typeof shares !== "number" || !isFinite(shares) || shares <= 0) {
    return NextResponse.json({ error: "ticker and shares (> 0) are required" }, { status: 400 });
  }

  // Check account status
  const { data: statusCheck } = await supabase
    .from("paper_accounts")
    .select("status, suspended_until")
    .eq("user_id", user.id)
    .single();

  if (statusCheck?.status === "liquidated" || statusCheck?.status === "suspended") {
    return NextResponse.json({ error: "Account suspended. Trading resumes next month." }, { status: 403 });
  }

  // Get position (including margin data)
  const { data: position } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost, borrowed, leverage, created_at")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .single();

  if (!position || position.shares < shares) {
    return NextResponse.json({
      error: position
        ? `Only have ${position.shares} shares of ${ticker}`
        : `No position in ${ticker}`,
    }, { status: 400 });
  }

  // Get current price
  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("price")
    .eq("ticker", ticker)
    .single();

  if (!priceData) {
    return NextResponse.json({ error: "Price unavailable" }, { status: 404 });
  }

  const price = priceData.price;
  const grossProceeds = shares * price;

  // Calculate proportional borrowed amount to repay
  const sellRatio = shares / position.shares;
  const borrowedRepay = (position.borrowed ?? 0) * sellRatio;

  // Net proceeds = gross - borrowed repayment
  // This can be negative if the position lost more than the margin
  const netProceeds = grossProceeds - borrowedRepay;

  // Realized P&L: compare to original margin (what user actually paid)
  const costBasis = shares * position.avg_cost;
  const originalMargin = costBasis - (borrowedRepay); // what user originally put up for these shares
  const realizedPnl = netProceeds - originalMargin;

  // Update cash balance (net proceeds can be negative — user owes)
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  const newBalance = (account?.cash_balance ?? 0) + netProceeds;
  await supabase
    .from("paper_accounts")
    .update({ cash_balance: Math.max(0, newBalance) })
    .eq("user_id", user.id);

  // Update or delete position
  const remainingShares = position.shares - shares;
  if (remainingShares <= 0.000001) {
    await supabase
      .from("paper_positions")
      .delete()
      .eq("user_id", user.id)
      .eq("ticker", ticker);
  } else {
    const remainingBorrowed = (position.borrowed ?? 0) - borrowedRepay;
    await supabase
      .from("paper_positions")
      .update({
        shares: remainingShares,
        borrowed: Math.max(0, remainingBorrowed),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("ticker", ticker);
  }

  // Record transaction
  await supabase.from("paper_transactions").insert({
    user_id: user.id,
    ticker,
    side: "sell",
    shares,
    price,
    total: netProceeds,
    leverage: position.leverage ?? 1,
  });

  return NextResponse.json({
    ok: true,
    ticker,
    side: "sell",
    shares,
    price,
    grossProceeds,
    borrowedRepay,
    netProceeds,
    realizedPnl,
    cashBalance: Math.max(0, newBalance),
  });
}
