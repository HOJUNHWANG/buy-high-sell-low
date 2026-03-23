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

  if (statusCheck?.status === "liquidated") {
    return NextResponse.json({ error: "Account liquidated. Revive first." }, { status: 403 });
  }
  if (statusCheck?.status === "suspended") {
    return NextResponse.json({ error: `Account suspended until ${statusCheck.suspended_until}.` }, { status: 403 });
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
  const total = shares * price;

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

  if (total > cashBalance) {
    return NextResponse.json({
      error: `Insufficient funds. Need $${total.toFixed(2)} but only have $${cashBalance.toFixed(2)}`,
    }, { status: 400 });
  }

  // Deduct cash
  const newBalance = cashBalance - total;
  const { error: updateErr } = await supabase
    .from("paper_accounts")
    .update({ cash_balance: newBalance })
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
  }

  // Upsert position (weighted average cost)
  const { data: existingPos } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .single();

  if (existingPos) {
    const newShares = existingPos.shares + shares;
    const newAvgCost = (existingPos.shares * existingPos.avg_cost + shares * price) / newShares;
    await supabase
      .from("paper_positions")
      .update({ shares: newShares, avg_cost: newAvgCost, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("ticker", ticker);
  } else {
    await supabase.from("paper_positions").insert({
      user_id: user.id,
      ticker,
      shares,
      avg_cost: price,
    });
  }

  // Record transaction
  await supabase.from("paper_transactions").insert({
    user_id: user.id,
    ticker,
    side: "buy",
    shares,
    price,
    total,
  });

  // Check achievements
  const candidates: string[] = [];

  // Trade count achievements
  candidates.push(...await checkTradeCountAchievements(supabase, user.id));

  // Crypto achievements
  candidates.push(...await checkCryptoAchievements(supabase, user.id, ticker));

  // Full send (90%+ of balance)
  if (total >= cashBalance * 0.9) candidates.push("full_send");

  // Penny pincher
  if (total < 10) candidates.push("penny_pincher");

  // Diversified (5+ positions)
  const { count: posCount } = await supabase
    .from("paper_positions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((posCount ?? 0) >= 5) candidates.push("diversified");

  // Day trader
  candidates.push(...await checkDayTrader(supabase, user.id));

  // Market timing (bargain_hunter, fomo_buyer)
  candidates.push(...await checkMarketTimingAchievements(supabase, ticker, "buy"));

  // Portfolio value achievements
  candidates.push(...await checkPortfolioValueAchievements(supabase, user.id, newBalance));

  // Grant new achievements with rewards
  const { newKeys: newAchievements, totalReward } = await grantAchievements(supabase, user.id, candidates);

  return NextResponse.json({
    ok: true,
    ticker,
    side: "buy",
    shares,
    price,
    total,
    cashBalance: newBalance + totalReward,
    newAchievements,
  });
}
