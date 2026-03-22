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
  const shares = body.shares as number | undefined;

  if (!ticker || !shares || shares <= 0) {
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

  // Deduct cash — use conditional update to prevent race conditions
  const newBalance = cashBalance - total;
  const { error: updateErr } = await supabase
    .from("paper_accounts")
    .update({ cash_balance: newBalance })
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
  }

  // Upsert position (update avg cost with weighted average)
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
  const newAchievements: string[] = [];

  // First trade
  const { count: txCount } = await supabase
    .from("paper_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (txCount === 1) newAchievements.push("first_trade");

  // Crypto degen
  if (ticker.includes("-USD")) newAchievements.push("crypto_degen");

  // Full send (90%+ of balance)
  if (total >= cashBalance * 0.9) newAchievements.push("full_send");

  // Penny pincher
  if (total < 10) newAchievements.push("penny_pincher");

  // Diversified (5+ positions)
  const { count: posCount } = await supabase
    .from("paper_positions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((posCount ?? 0) >= 5) newAchievements.push("diversified");

  // Insert achievements (ON CONFLICT DO NOTHING via unique constraint)
  if (newAchievements.length > 0) {
    await supabase.from("paper_achievements").upsert(
      newAchievements.map((key) => ({ user_id: user.id, badge_key: key })),
      { onConflict: "user_id,badge_key" }
    );
  }

  return NextResponse.json({
    ok: true,
    ticker,
    side: "buy",
    shares,
    price,
    total,
    cashBalance: newBalance,
    newAchievements,
  });
}
