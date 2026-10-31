import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { paperActionResponse, runPaperAction } from "@/lib/paper-actions";
import { getPriceFreshness } from "@/lib/price-freshness";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await createSupabaseAdmin().rpc("resolve_paper_challenges", { p_user_id: user.id, p_limit: 100 });
  if (error) return NextResponse.json({ error: "Unable to settle challenges" }, { status: 503 });
  const { data: quotes } = await supabase.from("stock_prices").select("ticker,price,fetched_at,provider_session_date");
  const eligible = (quotes ?? []).filter(q => q.price > 0 && ["live", "settled"].includes(getPriceFreshness(q.fetched_at,q.ticker,new Date(),undefined,q.provider_session_date).state)).map(q => q.ticker);
  const result = await runPaperAction(user.id, "challenge_create", { eligible_tickers: eligible });
  if (result.response) return result.response;
  const { data: rewards } = await supabase.from("paper_challenges").select("id,week_start,reward_usd")
    .eq("user_id", user.id).eq("status", "completed").eq("reward_claimed", false).order("week_start", { ascending: false });
  return NextResponse.json({ ...result.data, unclaimedRewards: rewards ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
export function POST(request: Request) { return paperActionResponse("challenge_submit", request); }
