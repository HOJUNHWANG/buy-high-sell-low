import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FICTIONAL_STARTING_CASH, valueFictionalPortfolio, type FictionalPosition, type FictionalQuote } from "@/lib/fictional-paper";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your Fictional portfolio." }, { status: 401 });

  const [account, positions, quotes] = await Promise.all([
    supabase.from("fictional_paper_accounts").select("cash_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("fictional_paper_positions").select("ticker, shares, avg_cost").eq("user_id", user.id).order("ticker"),
    supabase.from("fictional_prices").select("ticker, price, change_pct, fetched_at").order("ticker"),
  ]);
  if (account.error || positions.error || quotes.error) {
    return NextResponse.json({ error: "Fictional portfolio is temporarily unavailable. Please retry." }, { status: 503 });
  }
  const prices = (quotes.data ?? []) as FictionalQuote[];
  return NextResponse.json({
    ...valueFictionalPortfolio(account.data?.cash_balance ?? FICTIONAL_STARTING_CASH, (positions.data ?? []) as FictionalPosition[], prices),
    quotes: prices,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
