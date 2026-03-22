import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Daily check-in reward system.
 * Base: $50 + (streak * $20), streak max 10 then resets.
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

  // Suspended check
  if (account.status === "suspended") {
    const suspendedUntil = account.suspended_until;
    if (suspendedUntil && new Date(suspendedUntil) > new Date()) {
      return NextResponse.json({
        error: `Account suspended until ${suspendedUntil}. You'll get a fresh $1,000 start then.`,
      }, { status: 403 });
    }
  }

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
  let reward = 50 + (newStreak * 20); // base $50 + streak * $20
  let bonusMessage = "";

  // Every 10th day bonus
  if (newStreak === 10) {
    reward += 200;
    bonusMessage = " + $200 streak bonus!";
  }

  const newBalance = account.cash_balance + reward;

  // Update account
  await supabase
    .from("paper_accounts")
    .update({
      cash_balance: newBalance,
      last_checkin: today,
      streak: newStreak,
    })
    .eq("user_id", user.id);

  // Check streak achievements
  const newAchievements: string[] = [];
  if (newStreak >= 7) newAchievements.push("streak_7");

  // Track cumulative streak for 30-day badge
  // We approximate: if streak resets at 10, user needs 3 full cycles = 30 days
  // Use a simpler check: count total check-in days via transactions or just check badge existence
  const { count: totalCheckins } = await supabase
    .from("paper_accounts")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("last_checkin", "is", null);

  // For 30-day badge, we track via the streak counter cycling
  // If user has streak_7 already and keeps coming, they'll eventually hit 30
  // Simple approach: count paper_transactions as proxy for activity days
  if ((totalCheckins ?? 0) > 0) {
    // We'll award streak_30 when we detect long-term engagement
    // For now, just award streak_7
  }

  if (newAchievements.length > 0) {
    await supabase.from("paper_achievements").upsert(
      newAchievements.map((key) => ({ user_id: user.id, badge_key: key })),
      { onConflict: "user_id,badge_key" }
    );
  }

  return NextResponse.json({
    reward,
    streak: newStreak,
    cashBalance: newBalance,
    bonusMessage: bonusMessage || undefined,
    newAchievements,
  });
}
