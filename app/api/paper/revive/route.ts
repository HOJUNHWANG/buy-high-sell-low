import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST — Revive after liquidation with $500.
 * Only available once per month after first liquidation.
 * Second liquidation in same month = suspended.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("paper_accounts")
    .select("status, liquidation_count, last_liquidation_at")
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "No account" }, { status: 404 });

  if (account.status !== "liquidated") {
    return NextResponse.json({ error: "Account is not liquidated" }, { status: 400 });
  }

  // Check if eligible (not already revived this month → enforced by the 2nd liquidation = suspend rule)
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastLiq = account.last_liquidation_at ? new Date(account.last_liquidation_at) : null;
  const liqMonth = lastLiq
    ? `${lastLiq.getFullYear()}-${String(lastLiq.getMonth() + 1).padStart(2, "0")}`
    : null;

  if (liqMonth === thisMonth && account.liquidation_count >= 2) {
    return NextResponse.json({
      error: "Already liquidated twice this month. Suspended until next month.",
    }, { status: 403 });
  }

  // Revive: clear positions, set $500, status active
  await supabase.from("paper_positions").delete().eq("user_id", user.id);
  await supabase.from("paper_accounts").update({
    cash_balance: 500,
    status: "active",
    margin_call_at: null,
    streak: 0,
  }).eq("user_id", user.id);

  // Phoenix badge
  await supabase.from("paper_achievements").upsert(
    { user_id: user.id, badge_key: "phoenix" },
    { onConflict: "user_id,badge_key" }
  );

  return NextResponse.json({
    ok: true,
    cashBalance: 500,
    message: "You're back with $500. Don't blow it this time.",
  });
}
