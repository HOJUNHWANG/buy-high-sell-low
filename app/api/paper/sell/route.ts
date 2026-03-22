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
  const newAchievements: string[] = [];

  // Buy High Sell Low (realized a loss)
  if (realizedPnl < 0) newAchievements.push("buy_high_sell_low");

  // Paper Hands (sold within 24h of buy)
  const holdTime = Date.now() - new Date(position.created_at).getTime();
  if (holdTime < 24 * 60 * 60 * 1000) newAchievements.push("paper_hands");

  // Diamond Hands (held 30+ days)
  if (holdTime >= 30 * 24 * 60 * 60 * 1000) newAchievements.push("diamond_hands");

  // Broke (total portfolio under $100)
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("shares, avg_cost")
    .eq("user_id", user.id);
  const posValue = (positions ?? []).reduce(
    (sum: number, p: { shares: number; avg_cost: number }) => sum + p.shares * p.avg_cost, 0
  );
  if (newBalance + posValue < 100) newAchievements.push("broke");

  // Whale check
  if (newBalance + posValue > 5000) newAchievements.push("whale");

  if (newAchievements.length > 0) {
    await supabase.from("paper_achievements").upsert(
      newAchievements.map((key) => ({ user_id: user.id, badge_key: key })),
      { onConflict: "user_id,badge_key" }
    );
  }

  return NextResponse.json({
    ok: true,
    ticker,
    side: "sell",
    shares,
    price,
    total,
    realizedPnl,
    cashBalance: newBalance,
    newAchievements,
  });
}
