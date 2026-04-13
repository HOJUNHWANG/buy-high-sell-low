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
  let shares = body.shares as number;

  if (!ticker || !isFinite(shares) || shares <= 0) {
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

  // Allow a tiny epsilon for floating-point rounding (e.g. dollar→shares conversion)
  if (!position || position.shares < shares - 0.001) {
    return NextResponse.json({
      error: position
        ? `Only have ${position.shares} shares shorted in ${ticker}`
        : `No short position in ${ticker}`,
    }, { status: 400 });
  }
  // Clamp to exact position size to avoid downstream rounding artefacts
  if (shares > position.shares) shares = position.shares;

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

  // Update or delete position FIRST (before updating balance)
  const remainingShares = position.shares - shares;
  if (remainingShares <= 0.000001) {
    const { error: posErr } = await supabase
      .from("paper_positions")
      .delete()
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .eq("side", "short");
    if (posErr) {
      return NextResponse.json({ error: "Failed to close position" }, { status: 500 });
    }
  } else {
    const remainingBorrowed = (position.borrowed ?? 0) - borrowedRepay;
    const { error: posErr } = await supabase
      .from("paper_positions")
      .update({
        shares: remainingShares,
        borrowed: Math.max(0, remainingBorrowed),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .eq("side", "short");
    if (posErr) {
      return NextResponse.json({ error: "Failed to update position" }, { status: 500 });
    }
  }

  // Update cash balance (netProceeds can be negative if price spiked — unlimited loss!)
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  const newBalance = (account?.cash_balance ?? 0) + netProceeds;
  const { error: balErr } = await supabase
    .from("paper_accounts")
    .update({ cash_balance: Math.max(0, newBalance) })
    .eq("user_id", user.id);

  // Record transaction (non-fatal — position already updated)
  const { error: txErr } = await supabase.from("paper_transactions").insert({
    user_id: user.id,
    ticker,
    side: "cover",
    shares,
    price,
    total: netProceeds,
    leverage: position.leverage ?? 1,
  });

  return NextResponse.json({
    ...(balErr || txErr ? { warning: "Trade succeeded but some updates failed" } : {}),
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
