import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your trades." }, { status: 401 });
  const page = Math.min(10000, Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1));
  const { data, error } = await supabase.from("fictional_paper_transactions")
    .select("id, ticker, side, shares, price, total, realized_pnl, executed_at, cash_balance_after, price_fetched_at")
    .eq("user_id", user.id).order("executed_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * 20, page * 20);
  if (error) return NextResponse.json({ error: "Trade history is temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ transactions: data.slice(0, 20), hasMore: data.length > 20, page }, { headers: { "Cache-Control": "private, no-store" } });
}
