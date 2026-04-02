import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "adind96@gmail.com";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance, status")
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "No account" }, { status: 404 });

  const newBalance = (account.cash_balance ?? 0) < 1000 ? 1000 : (account.cash_balance ?? 0);

  await supabase.from("paper_accounts").update({
    status: "active",
    margin_call_at: null,
    suspended_until: null,
    cash_balance: newBalance,
  }).eq("user_id", user.id);

  return NextResponse.json({ status: "active", cashBalance: newBalance });
}
