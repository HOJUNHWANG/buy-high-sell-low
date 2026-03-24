import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { grantAchievements } from "@/lib/achievement-checker";

// Challenge picks are drawn from ALL tickers that have current price data in stock_prices

interface Pick {
  ticker: string;
  direction: "up" | "down" | null; // null = not yet predicted
  base_price: number;
  final_price: number | null;
  correct: boolean | null;
}

function getWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().split("T")[0],
    end: friday.toISOString().split("T")[0],
  };
}

/**
 * GET — Get current week's challenge.
 * Auto-generates 5-pick prediction challenge if none exists.
 * Auto-resolves results when week ends (but does NOT auto-pay — user must claim).
 */
export async function GET() {
  try {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { start, end } = getWeekBounds();

  // Check existing challenge for this week (use limit+order to handle duplicates gracefully)
  const { data: existingRows } = await supabase
    .from("paper_challenges")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", start)
    .order("id", { ascending: false })
    .limit(1);

  const existing = existingRows?.[0] ?? null;

  if (existing) {
    const now = new Date();
    const weekEnd = new Date(existing.week_end + "T23:59:59Z");
    const picks = (existing.picks ?? []) as Pick[];

    // Legacy challenge with empty picks — delete and regenerate
    if (picks.length === 0 && existing.status === "active") {
      await supabase.from("paper_challenges").delete().eq("id", existing.id);
      // Fall through to generate a new challenge below
    } else {

    // If submitted/pending and week ended → resolve results (no auto-pay)
    if (existing.status === "pending" && now > weekEnd) {
      const tickers = picks.map((p: Pick) => p.ticker);
      const { data: prices } = await supabase
        .from("stock_prices")
        .select("ticker, price")
        .in("ticker", tickers);

      const priceMap = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));

      let correctCount = 0;
      const resolvedPicks = picks.map((p: Pick) => {
        const finalPrice = priceMap.get(p.ticker) ?? p.base_price;
        const wentUp = finalPrice > p.base_price;
        const correct = p.direction === "up" ? wentUp : !wentUp;
        if (correct) correctCount++;
        return { ...p, final_price: finalPrice, correct };
      });

      // Calculate reward (stored but NOT paid until user claims)
      let reward = correctCount * 100;
      if (correctCount >= 5) reward = 500 * 2;        // $1,000
      else if (correctCount >= 4) reward = Math.round(correctCount * 100 * 1.5); // $600

      await supabase.from("paper_challenges")
        .update({
          picks: resolvedPicks,
          status: "completed",
          reward_usd: reward,
        })
        .eq("id", existing.id);

      return NextResponse.json({
        ...existing,
        picks: resolvedPicks,
        status: "completed",
        reward_usd: reward,
        correctCount,
        claimed: false,
      });
    }

    // If active (not submitted) and week ended → expire
    if (existing.status === "active" && now > weekEnd) {
      await supabase.from("paper_challenges")
        .update({ status: "expired" })
        .eq("id", existing.id);
      return NextResponse.json({ ...existing, status: "expired" });
    }

    // Enrich with current prices for active/pending challenges
    if (existing.status === "active" || existing.status === "pending") {
      const tickers = picks.map((p: Pick) => p.ticker);
      const { data: prices } = await supabase
        .from("stock_prices")
        .select("ticker, price")
        .in("ticker", tickers);

      const priceMap = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
      const enrichedPicks = picks.map((p: Pick) => ({
        ...p,
        currentPrice: priceMap.get(p.ticker) ?? p.base_price,
        currentPct: priceMap.has(p.ticker)
          ? ((priceMap.get(p.ticker)! - p.base_price) / p.base_price) * 100
          : 0,
      }));

      return NextResponse.json({ ...existing, picks: enrichedPicks });
    }

    // Completed: check if claimed (reward_claimed field)
    if (existing.status === "completed") {
      return NextResponse.json({
        ...existing,
        claimed: !!existing.reward_claimed,
      });
    }

    return NextResponse.json(existing);
    } // end else (non-empty picks)
  }

  // Generate new challenge: pick 5 random tickers from ALL available price data
  const { data: allPrices } = await supabase
    .from("stock_prices")
    .select("ticker, price");

  if (!allPrices || allPrices.length < 5) {
    return NextResponse.json(
      { error: "Not enough price data to generate challenge. Please try again later." },
      { status: 503 },
    );
  }

  // Shuffle and pick 5
  const shuffled = allPrices.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 5);
  const priceMap = new Map(selected.map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
  const tickersWithPrices = selected.map((p: { ticker: string }) => p.ticker);

  const picks: Pick[] = tickersWithPrices.map((t) => ({
    ticker: t,
    direction: null,
    base_price: priceMap.get(t)!,
    final_price: null,
    correct: null,
  }));

  const { data: newChallenge, error: insertError } = await supabase
    .from("paper_challenges")
    .insert({
      user_id: user.id,
      ticker: tickersWithPrices[0],
      challenge_type: "prediction",
      target_pct: 0,
      week_start: start,
      week_end: end,
      entry_price: priceMap.get(tickersWithPrices[0]) ?? null,
      picks,
      status: "active",
      reward_usd: 0,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Challenge insert error:", insertError.message);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }

  return NextResponse.json(newChallenge);
  } catch (err) {
    console.error("Challenge GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST — Submit predictions OR claim reward.
 * Body: { picks: [...] } to submit predictions
 * Body: { action: "claim" } to claim completed challenge reward
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { start } = getWeekBounds();

  // ── Claim reward ──
  if (body.action === "claim") {
    const { data: challengeRows } = await supabase
      .from("paper_challenges")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", start)
      .order("id", { ascending: false })
      .limit(1);

    const challenge = challengeRows?.[0] ?? null;
    if (!challenge) {
      return NextResponse.json({ error: "No challenge found" }, { status: 404 });
    }

    if (challenge.status !== "completed") {
      return NextResponse.json({ error: "Challenge not yet completed" }, { status: 400 });
    }

    if (challenge.reward_claimed) {
      return NextResponse.json({ error: "Reward already claimed", claimed: true }, { status: 400 });
    }

    const reward = challenge.reward_usd ?? 0;

    // Grant cash reward
    if (reward > 0) {
      const { data: account } = await supabase
        .from("paper_accounts")
        .select("cash_balance")
        .eq("user_id", user.id)
        .single();
      if (account) {
        await supabase.from("paper_accounts")
          .update({ cash_balance: account.cash_balance + reward })
          .eq("user_id", user.id);
      }
    }

    // Mark as claimed
    await supabase.from("paper_challenges")
      .update({ reward_claimed: true })
      .eq("id", challenge.id);

    // Achievement checks
    const achievementCandidates = ["challenge_done"];

    const { data: recentChallenges } = await supabase
      .from("paper_challenges")
      .select("status, week_start")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("week_start", { ascending: false })
      .limit(4);

    if (recentChallenges && recentChallenges.length >= 4) {
      const weeks = recentChallenges.map((c: { week_start: string }) => new Date(c.week_start).getTime());
      const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      let consecutive = true;
      for (let i = 0; i < weeks.length - 1; i++) {
        if (Math.abs(weeks[i] - weeks[i + 1] - WEEK_MS) > 2 * 24 * 60 * 60 * 1000) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) achievementCandidates.push("perfect_month");
    }

    await grantAchievements(supabase, user.id, achievementCandidates);

    return NextResponse.json({ ok: true, claimed: true, reward });
  }

  // ── Submit predictions ──
  const predictions = body.picks as { ticker: string; direction: "up" | "down" }[] | undefined;
  if (!predictions || !Array.isArray(predictions) || predictions.length !== 5) {
    return NextResponse.json({ error: "Must submit exactly 5 predictions" }, { status: 400 });
  }

  for (const p of predictions) {
    if (!p.ticker || !["up", "down"].includes(p.direction)) {
      return NextResponse.json({ error: `Invalid prediction for ${p.ticker}` }, { status: 400 });
    }
  }

  const { data: challengeRows2 } = await supabase
    .from("paper_challenges")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", start)
    .order("id", { ascending: false })
    .limit(1);

  const challenge = challengeRows2?.[0] ?? null;
  if (!challenge) {
    return NextResponse.json({ error: "No challenge found for this week" }, { status: 404 });
  }

  if (challenge.status !== "active") {
    return NextResponse.json({ error: "Challenge already submitted or expired" }, { status: 400 });
  }

  // Check deadline (Friday close = Friday 21:00 UTC / 4 PM ET)
  const friday = new Date(challenge.week_end + "T21:00:00Z");
  if (new Date() > friday) {
    return NextResponse.json({ error: "Deadline passed (Friday market close)" }, { status: 400 });
  }

  const currentPicks = (challenge.picks ?? []) as Pick[];
  const predMap = new Map(predictions.map((p) => [p.ticker, p.direction]));

  const updatedPicks = currentPicks.map((p: Pick) => ({
    ...p,
    direction: predMap.get(p.ticker) ?? p.direction,
  }));

  if (updatedPicks.some((p: Pick) => !p.direction)) {
    return NextResponse.json({ error: "All 5 picks must have a direction" }, { status: 400 });
  }

  await supabase.from("paper_challenges")
    .update({
      picks: updatedPicks,
      status: "pending",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", challenge.id);

  return NextResponse.json({ ok: true, status: "pending", picks: updatedPicks });
}
