import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  grantAchievements,
  checkTradeCountAchievements,
  checkPortfolioValueAchievements,
  checkDayTrader,
  checkHoldAchievements,
} from "@/lib/achievement-checker";

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
  if (remainingShares <= 0) {
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

  // Check achievements
  const candidates: string[] = [];

  // "Buy High Sell Low" in reverse — covered at a loss (price went up)
  if (realizedPnl < 0) candidates.push("buy_high_sell_low");

  // Contrarian: profit $200+ from a short cover
  if (realizedPnl >= 200) candidates.push("contrarian");

  // Short squeeze: lose $500+ covering a short
  if (realizedPnl <= -500) candidates.push("short_squeeze");

  // Bear king: check total realized short profits ($1,000+)
  const { data: coverTxs } = await supabase
    .from("paper_transactions")
    .select("total")
    .eq("user_id", user.id)
    .eq("side", "cover");
  if (coverTxs) {
    // total field in cover tx = netProceeds (margin + pnl), need to estimate realized profits
    // Simplified: sum all cover totals minus sum of corresponding short margins
    // For accuracy, we track that positive realizedPnl accumulates
    // Use current realizedPnl + historical as proxy
    const { data: shortTxs } = await supabase
      .from("paper_transactions")
      .select("total")
      .eq("user_id", user.id)
      .eq("side", "short");
    const totalShortMargin = (shortTxs ?? []).reduce((s: number, t: { total: number }) => s + t.total, 0);
    const totalCoverReturns = (coverTxs ?? []).reduce((s: number, t: { total: number }) => s + t.total, 0);
    const totalShortProfit = totalCoverReturns - totalShortMargin;
    if (totalShortProfit >= 1000) candidates.push("bear_king");
  }

  // Hold-based achievements
  candidates.push(...await checkHoldAchievements(supabase, user.id, position.created_at));

  // Paper Hands (covered within 24h)
  const holdTime = Date.now() - new Date(position.created_at).getTime();
  if (holdTime < 24 * 60 * 60 * 1000) candidates.push("paper_hands");

  // Flash profit ($500+ realized on single cover)
  if (realizedPnl >= 500) candidates.push("flash_profit");

  candidates.push(...await checkTradeCountAchievements(supabase, user.id));
  candidates.push(...await checkDayTrader(supabase, user.id));
  candidates.push(...await checkPortfolioValueAchievements(supabase, user.id, newBalance));

  // Zero to hero check
  const { data: hasBroke } = await supabase
    .from("paper_achievements")
    .select("badge_key")
    .eq("user_id", user.id)
    .eq("badge_key", "broke")
    .single();

  if (hasBroke) {
    const { data: allPos } = await supabase
      .from("paper_positions")
      .select("ticker, shares, side, avg_cost, borrowed")
      .eq("user_id", user.id);
    let totalVal = newBalance;
    if (allPos && allPos.length > 0) {
      const tickers = allPos.map((p: { ticker: string }) => p.ticker);
      const { data: prices } = await supabase
        .from("stock_prices")
        .select("ticker, price")
        .in("ticker", tickers);
      const pm = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
      for (const pos of allPos) {
        const curPrice = pm.get(pos.ticker) ?? 0;
        const mv = pos.shares * curPrice;
        const b = pos.borrowed ?? 0;
        if (pos.side === "short") {
          // Short equity = margin_used + (avg_cost - curPrice) × shares
          const marginUsedPos = pos.shares * pos.avg_cost - b;
          const pnl = (pos.avg_cost - curPrice) * pos.shares;
          totalVal += marginUsedPos + pnl;
        } else {
          totalVal += mv - b;
        }
      }
    }
    if (totalVal > 5000) candidates.push("zero_to_hero");
  }

  const { newKeys: newAchievements, totalReward } = await grantAchievements(supabase, user.id, candidates);

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
    cashBalance: Math.max(0, newBalance) + totalReward,
    newAchievements,
  });
}
