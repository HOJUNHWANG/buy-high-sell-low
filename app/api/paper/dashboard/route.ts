import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaperLiquidation } from "@/lib/paper-actions";
import { getPaperPortfolio } from "@/lib/paper-portfolio";
import { getPaperChallenge } from "@/lib/paper-challenge";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const challengePromise = getPaperChallenge(user.id, supabase).catch(() =>
    NextResponse.json({ error: "Unable to load challenge" }, { status: 503 }));
  try {
    const liquidation = await getPaperLiquidation(user.id, supabase);
    // Liquidation can change cash and positions. Always read the portfolio after it.
    const [portfolio, challenge] = await Promise.all([
      getPaperPortfolio(user.id, supabase), challengePromise,
    ]);
    if (!portfolio.ok) return portfolio;
    const challengeBody = await challenge.json();
    return NextResponse.json({
      portfolio: await portfolio.json(),
      liquidation: liquidation.ok ? await liquidation.json() : null,
      challenge: challenge.ok ? challengeBody : null,
      challengeError: challenge.ok ? null : challengeBody.error ?? "Challenge unavailable",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load portfolio" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
