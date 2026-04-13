import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Daily check-in reward system.
 * Base: $100 + (streak * $20), streak max 10 then resets.
 * Every 10th cumulative day (streak hits 10): bonus $200.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance, last_checkin, streak, status, suspended_until")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "No account found" }, { status: 404 });
  }

  // Check-in is always allowed — even during liquidation/suspension.
  // This keeps users engaged while they wait for revival.

  const today = new Date().toISOString().split("T")[0];

  // Already checked in today
  if (account.last_checkin === today) {
    return NextResponse.json({
      error: "Already checked in today",
      alreadyCheckedIn: true,
      streak: account.streak,
    }, { status: 200 });
  }

  // Calculate streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const isConsecutive = account.last_checkin === yesterday;
  let newStreak = isConsecutive ? account.streak + 1 : 1;

  // Streak caps at 10, then resets to 1
  if (newStreak > 10) newStreak = 1;

  // Calculate reward
  let reward = 100 + (newStreak * 20); // base $100 + streak * $20
  let bonusMessage = "";

  // Every 10th day bonus
  if (newStreak === 10) {
    reward += 200;
    bonusMessage = " + $200 streak bonus!";
  }

  const newBalance = account.cash_balance + reward;

  // Update account
  const { error: updateErr } = await supabase
    .from("paper_accounts")
    .update({
      cash_balance: newBalance,
      last_checkin: today,
      streak: newStreak,
    })
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update check-in" }, { status: 500 });
  }

  return NextResponse.json({
    reward,
    streak: newStreak,
    cashBalance: newBalance,
    bonusMessage: bonusMessage || undefined,
  });
}
