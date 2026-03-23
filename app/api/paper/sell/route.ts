import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  grantAchievements,
  checkTradeCountAchievements,
  checkPortfolioValueAchievements,
  checkDayTrader,
  checkHoldAchievements,
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

  // Get position
  const { data: position } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost, created_at")
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
  const total = shares * price;
  const costBasis = shares * position.avg_cost;
  const realizedPnl = total - costBasis;

  // Update cash balance
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  const newBalance = (account?.cash_balance ?? 0) + total;
  await supabase
    .from("paper_accounts")
    .update({ cash_balance: newBalance })
    .eq("user_id", user.id);

  // Update or delete position
  const remainingShares = position.shares - shares;
  if (remainingShares <= 0) {
    await supabase
      .from("paper_positions")
      .delete()
      .eq("user_id", user.id)
      .eq("ticker", ticker);
  } else {
    await supabase
      .from("paper_positions")
      .update({ shares: remainingShares, updated_at: new Date().toISOString() })
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
    total,
  });

  // Check achievements
  const candidates: string[] = [];

  // Buy High Sell Low (realized a loss)
  if (realizedPnl < 0) candidates.push("buy_high_sell_low");

  // Hold-based achievements
  candidates.push(...await checkHoldAchievements(supabase, user.id, position.created_at));

  // Paper Hands (sold within 24h)
  const holdTime = Date.now() - new Date(position.created_at).getTime();
  if (holdTime < 24 * 60 * 60 * 1000) candidates.push("paper_hands");

  // Flash profit ($500+ realized on single sell)
  if (realizedPnl >= 500) candidates.push("flash_profit");

  // Trade count achievements
  candidates.push(...await checkTradeCountAchievements(supabase, user.id));

  // Day trader
  candidates.push(...await checkDayTrader(supabase, user.id));

  // Portfolio value achievements
  candidates.push(...await checkPortfolioValueAchievements(supabase, user.id, newBalance));

  // Zero to hero: check if user was ever broke and now over $5k
  // We check if they have the "broke" badge and current value > $5k
  const { data: hasBroke } = await supabase
    .from("paper_achievements")
    .select("badge_key")
    .eq("user_id", user.id)
    .eq("badge_key", "broke")
    .single();

  if (hasBroke) {
    const { data: allPos } = await supabase
      .from("paper_positions")
      .select("ticker, shares")
      .eq("user_id", user.id);
    let totalVal = newBalance;
    if (allPos && allPos.length > 0) {
      const tickers = allPos.map((p: { ticker: string }) => p.ticker);
      const { data: prices } = await supabase
        .from("stock_prices")
        .select("ticker, price")
        .in("ticker", tickers);
      const pm = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
      for (const pos of allPos) totalVal += pos.shares * (pm.get(pos.ticker) ?? 0);
    }
    if (totalVal > 5000) candidates.push("zero_to_hero");
  }

  // Grant new achievements with rewards
  const { newKeys: newAchievements, totalReward } = await grantAchievements(supabase, user.id, candidates);

  return NextResponse.json({
    ok: true,
    ticker,
    side: "sell",
    shares,
    price,
    total,
    realizedPnl,
    cashBalance: newBalance + totalReward,
    newAchievements,
  });
}
