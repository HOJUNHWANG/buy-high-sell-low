import { BADGES } from "@/lib/achievements";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Grant achievements that haven't been earned yet, and add cash rewards.
 * Returns { newKeys, totalReward } so the caller can compute final balance.
 */
export async function grantAchievements(
  supabase: SupabaseClient,
  userId: string,
  candidateKeys: string[]
): Promise<{ newKeys: string[]; totalReward: number }> {
  if (candidateKeys.length === 0) return { newKeys: [], totalReward: 0 };

  // Deduplicate
  const unique = [...new Set(candidateKeys)];

  // Check which ones user already has
  const { data: existing } = await supabase
    .from("paper_achievements")
    .select("badge_key")
    .eq("user_id", userId)
    .in("badge_key", unique);

  const alreadyEarned = new Set((existing ?? []).map((e: { badge_key: string }) => e.badge_key));
  const newKeys = unique.filter((k) => !alreadyEarned.has(k) && BADGES[k]);

  if (newKeys.length === 0) return { newKeys: [], totalReward: 0 };

  // Insert new achievements
  await supabase.from("paper_achievements").upsert(
    newKeys.map((key) => ({ user_id: userId, badge_key: key })),
    { onConflict: "user_id,badge_key" }
  );

  // Calculate total reward
  const totalReward = newKeys.reduce((sum, key) => sum + (BADGES[key]?.reward ?? 0), 0);

  if (totalReward > 0) {
    // Add reward to cash balance
    const { data: account } = await supabase
      .from("paper_accounts")
      .select("cash_balance")
      .eq("user_id", userId)
      .single();

    if (account) {
      await supabase
        .from("paper_accounts")
        .update({ cash_balance: account.cash_balance + totalReward })
        .eq("user_id", userId);
    }
  }

  return { newKeys, totalReward };
}

/**
 * Check trade-count based achievements (ten_trades, fifty_trades, hundred_trades).
 */
export async function checkTradeCountAchievements(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { count } = await supabase
    .from("paper_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const c = count ?? 0;
  const candidates: string[] = [];
  if (c >= 1) candidates.push("first_trade");
  if (c >= 10) candidates.push("ten_trades");
  if (c >= 50) candidates.push("fifty_trades");
  if (c >= 100) candidates.push("hundred_trades");
  return candidates;
}

/**
 * Check portfolio-value based achievements (whale, double_up, triple_up, ten_x, broke, zero_to_hero).
 */
export async function checkPortfolioValueAchievements(
  supabase: SupabaseClient,
  userId: string,
  cashBalance: number
): Promise<string[]> {
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("ticker, shares, side, avg_cost, borrowed")
    .eq("user_id", userId);

  let totalValue = cashBalance;
  if (positions && positions.length > 0) {
    const tickers = [...new Set(positions.map((p: { ticker: string }) => p.ticker))];
    const { data: prices } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);

    const priceMap = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
    for (const pos of positions as { ticker: string; shares: number; side?: string; avg_cost: number; borrowed?: number }[]) {
      const curPrice = priceMap.get(pos.ticker) ?? 0;
      const borrowed = pos.borrowed ?? 0;
      if (pos.side === "short") {
        const marginUsed = pos.shares * pos.avg_cost - borrowed;
        const pnl = (pos.avg_cost - curPrice) * pos.shares;
        totalValue += marginUsed + pnl;
      } else {
        totalValue += pos.shares * curPrice - borrowed;
      }
    }
  }

  const candidates: string[] = [];
  if (totalValue > 5000) candidates.push("whale");
  if (totalValue >= 2000) candidates.push("double_up");
  if (totalValue >= 3000) candidates.push("triple_up");
  if (totalValue >= 10000) candidates.push("ten_x");
  if (totalValue < 100) candidates.push("broke");

  return candidates;
}

/**
 * Check crypto-related achievements.
 */
export async function checkCryptoAchievements(
  supabase: SupabaseClient,
  userId: string,
  ticker: string
): Promise<string[]> {
  const candidates: string[] = [];
  if (ticker.includes("-USD")) {
    candidates.push("crypto_degen");

    // Check crypto_collector (3+ different cryptos held)
    const { data: cryptoPositions } = await supabase
      .from("paper_positions")
      .select("ticker")
      .eq("user_id", userId)
      .like("ticker", "%-USD");

    if ((cryptoPositions?.length ?? 0) >= 3) {
      candidates.push("crypto_collector");
    }
  }
  return candidates;
}

/**
 * Check day_trader achievement (5+ trades in one day).
 */
export async function checkDayTrader(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("paper_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("executed_at", todayStart.toISOString());

  if ((count ?? 0) >= 5) return ["day_trader"];
  return [];
}

/**
 * Check profit_master and market_wizard (consecutive profitable sells).
 */
export async function checkProfitStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  // Get last 10 sell transactions, ordered newest first
  const { data: sells } = await supabase
    .from("paper_transactions")
    .select("price, ticker, shares, executed_at")
    .eq("user_id", userId)
    .eq("side", "sell")
    .order("executed_at", { ascending: false })
    .limit(10);

  if (!sells || sells.length === 0) return [];

  // We need to check if the sell was profitable by comparing to avg_cost at the time
  // Since we don't store realized PnL in transactions, we approximate:
  // Get the most recent sell transactions and check if each was above avg_cost
  // Actually, we'll use a simpler heuristic — count consecutive profitable sells from paper_transactions
  // by joining with the buy history. For simplicity, track via a separate approach:
  // Check the last N sells and see if they were above the average cost at time of sale.

  // Simplified: we don't have per-transaction realized PnL stored, so we skip this for now
  // and only trigger when we can confirm from the current sell.
  return [];
}

/**
 * Check bargain_hunter and fomo_buyer based on stock's change_pct.
 */
export async function checkMarketTimingAchievements(
  supabase: SupabaseClient,
  ticker: string,
  side: "buy" | "sell"
): Promise<string[]> {
  if (side !== "buy") return [];

  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("change_pct")
    .eq("ticker", ticker)
    .single();

  const changePct = priceData?.change_pct ?? 0;
  const candidates: string[] = [];
  if (changePct <= -5) candidates.push("bargain_hunter");
  if (changePct >= 5) candidates.push("fomo_buyer");
  return candidates;
}

/**
 * Check hodl-based achievements (diamond_hands 30d, hodl_master 90d, ultimate_hodl 5+@60d).
 */
export async function checkHoldAchievements(
  supabase: SupabaseClient,
  userId: string,
  positionCreatedAt: string
): Promise<string[]> {
  const holdMs = Date.now() - new Date(positionCreatedAt).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const candidates: string[] = [];

  if (holdMs >= 30 * DAY) candidates.push("diamond_hands");
  if (holdMs >= 90 * DAY) candidates.push("hodl_master");

  // ultimate_hodl: 5+ positions each held 60+ days
  const { data: allPositions } = await supabase
    .from("paper_positions")
    .select("created_at")
    .eq("user_id", userId);

  if (allPositions) {
    const longHeld = allPositions.filter(
      (p: { created_at: string }) => Date.now() - new Date(p.created_at).getTime() >= 60 * DAY
    );
    if (longHeld.length >= 5) candidates.push("ultimate_hodl");
  }

  return candidates;
}
