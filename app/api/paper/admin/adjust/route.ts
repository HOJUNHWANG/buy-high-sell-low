import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_ADMIN_ADJUSTMENTS = new Set([
  1000,
  10000,
  100000,
  1000000,
  -1000,
  -10000,
  -100000,
  -1000000,
]);

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const delta: number = body.delta;
  if (!ALLOWED_ADMIN_ADJUSTMENTS.has(delta)) {
    return NextResponse.json({ error: "delta must be one of ±1000, ±10000, ±100000, or ±1000000" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "No account" }, { status: 404 });

  const newBalance = Math.max(0, (account.cash_balance ?? 0) + delta);

  await supabase.from("paper_accounts")
    .update({ cash_balance: newBalance })
    .eq("user_id", user.id);

  return NextResponse.json({ cashBalance: newBalance });
}
