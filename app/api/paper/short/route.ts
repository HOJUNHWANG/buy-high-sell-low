import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  grantAchievements,
  checkTradeCountAchievements,
  checkPortfolioValueAchievements,
  checkCryptoAchievements,
  checkDayTrader,
  checkMarketTimingAchievements,
} from "@/lib/achievement-checker";

/**
 * POST /api/paper/short — Open a short position.
 *
 * Mechanics (realistic):
 * - User posts margin (collateral) = baseShares × price
 * - With leverage, effectiveShares = baseShares × leverage
 * - borrowed = margin × (leverage - 1) — additional collateral from broker
 * - Profit when price drops, loss when price rises (unlimited loss potential)
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
  const leverage = typeof body.leverage === "number" && body.leverage >= 1 && body.leverage <= 100
    ? Math.floor(body.leverage)
    : 1;

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

  // Get current price
  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("price")
    .eq("ticker", ticker)
    .single();

  if (!priceData) {
    return NextResponse.json({ error: "Ticker not found or price unavailable" }, { status: 404 });
  }

  const price = priceData.price;
  const effectiveShares = shares * leverage;
  const margin = shares * price;              // cash collateral
  const borrowed = margin * (leverage - 1);   // broker-supplied collateral

  // Auto-create account if needed
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  let cashBalance = 1000;
  if (!account) {
    await supabase.from("paper_accounts").insert({ user_id: user.id, cash_balance: 1000 });
  } else {
    cashBalance = account.cash_balance;
  }

  if (margin > cashBalance) {
    return NextResponse.json({
      error: `Insufficient margin. Need $${margin.toFixed(2)} but only have $${cashBalance.toFixed(2)}`,
    }, { status: 400 });
  }

  // Deduct margin from cash
  const newBalance = cashBalance - margin;
  const { error: updateErr } = await supabase
    .from("paper_accounts")
    .update({ cash_balance: newBalance })
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
  }

  // Upsert short position (weighted average cost + accumulated borrowed)
  const { data: existingPos } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost, borrowed")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .eq("side", "short")
    .single();

  if (existingPos) {
    const newShares = existingPos.shares + effectiveShares;
    const newAvgCost = (existingPos.shares * existingPos.avg_cost + effectiveShares * price) / newShares;
    const newBorrowed = (existingPos.borrowed ?? 0) + borrowed;
    await supabase
      .from("paper_positions")
      .update({
        shares: newShares,
        avg_cost: newAvgCost,
        borrowed: newBorrowed,
        leverage: borrowed > 0 || (existingPos.borrowed ?? 0) > 0 ? leverage : 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .eq("side", "short");
  } else {
    await supabase.from("paper_positions").insert({
      user_id: user.id,
      ticker,
      side: "short",
      shares: effectiveShares,
      avg_cost: price,
      leverage,
      borrowed,
    });
  }

  // Record transaction
  await supabase.from("paper_transactions").insert({
    user_id: user.id,
    ticker,
    side: "short",
    shares: effectiveShares,
    price,
    total: margin,
    leverage,
  });

  // Check achievements
  const candidates: string[] = [];
  candidates.push("short_seller"); // first short
  candidates.push(...await checkTradeCountAchievements(supabase, user.id));
  candidates.push(...await checkCryptoAchievements(supabase, user.id, ticker));

  if (margin >= cashBalance * 0.9) candidates.push("full_send");
  if (margin < 10) candidates.push("penny_pincher");

  const { count: posCount } = await supabase
    .from("paper_positions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((posCount ?? 0) >= 5) candidates.push("diversified");

  // Bear raid: 3+ concurrent short positions
  const { count: shortCount } = await supabase
    .from("paper_positions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("side", "short");
  if ((shortCount ?? 0) >= 3) candidates.push("bear_raid");

  candidates.push(...await checkDayTrader(supabase, user.id));
  candidates.push(...await checkMarketTimingAchievements(supabase, ticker, "sell"));
  candidates.push(...await checkPortfolioValueAchievements(supabase, user.id, newBalance));

  const { newKeys: newAchievements, totalReward } = await grantAchievements(supabase, user.id, candidates);

  return NextResponse.json({
    ok: true,
    ticker,
    side: "short",
    shares: effectiveShares,
    price,
    margin,
    borrowed,
    leverage,
    cashBalance: newBalance + totalReward,
    newAchievements,
  });
}
