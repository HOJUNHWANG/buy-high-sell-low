import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "adind96@gmail.com";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const delta: number = body.delta;
  if (delta !== 1000 && delta !== -1000) {
    return NextResponse.json({ error: "delta must be +1000 or -1000" }, { status: 400 });
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
