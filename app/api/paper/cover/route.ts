import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/paper/cover — Close (cover) a short position.
 *
 * Mechanics:
 * - Buy back shares at current price to return to broker
 * - P&L = (avg_cost - currentPrice) × shares  (profit when price dropped)
 * - Return: original margin + P&L (can be negative → user owes money)
 * - Unlimited loss potential: if price rose significantly, netProceeds can be negative
 */
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

  // Get short position
  const { data: position } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost, borrowed, leverage, created_at")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .eq("side", "short")
    .single();

  if (!position || position.shares < shares) {
    return NextResponse.json({
      error: position
        ? `Only have ${position.shares} shares shorted in ${ticker}`
        : `No short position in ${ticker}`,
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

  // Calculate cover economics
  const sellRatio = shares / position.shares;
  const borrowedRepay = (position.borrowed ?? 0) * sellRatio;

  // Cost basis = what we originally sold the shares for
  const costBasis = shares * position.avg_cost;
  // Cost to buy back
  const costToCover = shares * price;
  // Short P&L: profit when price dropped
  const shortPnl = costBasis - costToCover;
  // Margin originally locked up for these shares
  const marginUsed = costBasis - borrowedRepay;
  // Net return to cash = margin back + P&L
  const netProceeds = marginUsed + shortPnl;
  // Realized P&L (same as shortPnl)
  const realizedPnl = shortPnl;

  // Update cash balance (netProceeds can be negative if price spiked — unlimited loss!)
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
      .eq("ticker", ticker)
      .eq("side", "short");
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
      .eq("ticker", ticker)
      .eq("side", "short");
  }

  // Record transaction
  await supabase.from("paper_transactions").insert({
    user_id: user.id,
    ticker,
    side: "cover",
    shares,
    price,
    total: netProceeds,
    leverage: position.leverage ?? 1,
  });


  return NextResponse.json({
    ok: true,
    ticker,
    side: "cover",
    shares,
    price,
    costToCover,
    marginReturned: marginUsed,
    netProceeds,
    realizedPnl,
    cashBalance: Math.max(0, newBalance),
  });
}
