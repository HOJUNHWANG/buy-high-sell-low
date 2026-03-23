import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { grantAchievements } from "@/lib/achievement-checker";

// Pool of tickers for weekly challenges (mix of stocks + crypto)
const CHALLENGE_POOL = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "MA",
  "HD", "COST", "WMT", "BAC", "NFLX", "CRM", "ORCL", "BA", "GS", "CAT",
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD",
];

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

function pickRandomTickers(count: number): string[] {
  const pool = [...CHALLENGE_POOL];
  const picks: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

/**
 * GET — Get current week's challenge.
 * Auto-generates 5-pick prediction challenge if none exists.
 * Auto-resolves if week has ended.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { start, end } = getWeekBounds();

  // Check existing challenge for this week
  const { data: existing } = await supabase
    .from("paper_challenges")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", start)
    .single();

  if (existing) {
    const now = new Date();
    const weekEnd = new Date(existing.week_end + "T23:59:59Z");
    const picks = (existing.picks ?? []) as Pick[];

    // If submitted/pending and week ended → resolve
    if (existing.status === "pending" && now > weekEnd) {
      // Fetch final prices for all tickers
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

      // Calculate reward
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

      // Grant reward
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

      // Achievement checks
      const achievementCandidates = ["challenge_done"];

      // perfect_month: 4 consecutive completed challenges
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

      return NextResponse.json({
        ...existing,
        picks: resolvedPicks,
        status: "completed",
        reward_usd: reward,
        correctCount,
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

    return NextResponse.json(existing);
  }

  // Generate new challenge: 5 random tickers with base prices
  const tickers = pickRandomTickers(5);

  // Fetch base prices
  const { data: prices } = await supabase
    .from("stock_prices")
    .select("ticker, price")
    .in("ticker", tickers);

  const priceMap = new Map((prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));

  const picks: Pick[] = tickers.map((t) => ({
    ticker: t,
    direction: null,
    base_price: priceMap.get(t) ?? 0,
    final_price: null,
    correct: null,
  }));

  const { data: newChallenge } = await supabase
    .from("paper_challenges")
    .insert({
      user_id: user.id,
      ticker: tickers[0], // Keep first ticker for backward compat
      challenge_type: "prediction",
      target_pct: 0,
      week_start: start,
      week_end: end,
      entry_price: priceMap.get(tickers[0]) ?? null,
      picks,
      status: "active",
      reward_usd: 0,
    })
    .select()
    .single();

  return NextResponse.json(newChallenge);
}

/**
 * POST — Submit predictions (up/down for each pick).
 * Body: { picks: [{ ticker: string, direction: "up"|"down" }, ...] }
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

  const predictions = body.picks as { ticker: string; direction: "up" | "down" }[] | undefined;
  if (!predictions || !Array.isArray(predictions) || predictions.length !== 5) {
    return NextResponse.json({ error: "Must submit exactly 5 predictions" }, { status: 400 });
  }

  // Validate all directions
  for (const p of predictions) {
    if (!p.ticker || !["up", "down"].includes(p.direction)) {
      return NextResponse.json({ error: `Invalid prediction for ${p.ticker}` }, { status: 400 });
    }
  }

  const { start } = getWeekBounds();

  // Get current challenge
  const { data: challenge } = await supabase
    .from("paper_challenges")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", start)
    .single();

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

  // Merge predictions into picks
  const currentPicks = (challenge.picks ?? []) as Pick[];
  const predMap = new Map(predictions.map((p) => [p.ticker, p.direction]));

  const updatedPicks = currentPicks.map((p: Pick) => ({
    ...p,
    direction: predMap.get(p.ticker) ?? p.direction,
  }));

  // Verify all picks have a direction
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
