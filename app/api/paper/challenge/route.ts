import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Popular tickers for challenges
const CHALLENGE_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA",
  "JPM", "V", "MA", "HD", "COST", "WMT", "BAC",
  "BTC-USD", "ETH-USD", "SOL-USD",
];

const CHALLENGE_TARGETS = [3, 5, 7, 10]; // % gain targets

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
 * GET — Get current week's challenge (auto-generate if none exists).
 * POST — Check challenge completion.
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
    // If active, check if it should expire
    if (existing.status === "active") {
      const now = new Date();
      const weekEnd = new Date(existing.week_end + "T23:59:59Z");
      if (now > weekEnd) {
        // Expire the challenge
        await supabase.from("paper_challenges")
          .update({ status: "expired" })
          .eq("id", existing.id);
        existing.status = "expired";
      } else {
        // Check current price vs entry to see if completed
        const { data: priceData } = await supabase
          .from("stock_prices")
          .select("price")
          .eq("ticker", existing.ticker)
          .single();

        if (priceData && existing.entry_price) {
          const currentPct = ((priceData.price - existing.entry_price) / existing.entry_price) * 100;
          if (currentPct >= existing.target_pct) {
            // Challenge completed!
            await supabase.from("paper_challenges")
              .update({ status: "completed" })
              .eq("id", existing.id);
            existing.status = "completed";

            // Award reward
            const { data: account } = await supabase
              .from("paper_accounts")
              .select("cash_balance")
              .eq("user_id", user.id)
              .single();
            if (account) {
              await supabase.from("paper_accounts")
                .update({ cash_balance: account.cash_balance + existing.reward_usd })
                .eq("user_id", user.id);
            }

            // Achievement
            await supabase.from("paper_achievements").upsert(
              { user_id: user.id, badge_key: "challenge_done" },
              { onConflict: "user_id,badge_key" }
            );
          }

          return NextResponse.json({
            ...existing,
            currentPrice: priceData.price,
            currentPct,
          });
        }
      }
    }

    return NextResponse.json(existing);
  }

  // Generate new challenge for this week
  const ticker = CHALLENGE_TICKERS[Math.floor(Math.random() * CHALLENGE_TICKERS.length)];
  const targetPct = CHALLENGE_TARGETS[Math.floor(Math.random() * CHALLENGE_TARGETS.length)];

  // Get current price as entry
  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("price")
    .eq("ticker", ticker)
    .single();

  const entryPrice = priceData?.price ?? null;

  const { data: newChallenge } = await supabase
    .from("paper_challenges")
    .insert({
      user_id: user.id,
      ticker,
      challenge_type: "gain_pct",
      target_pct: targetPct,
      week_start: start,
      week_end: end,
      entry_price: entryPrice,
      reward_usd: 200,
    })
    .select()
    .single();

  return NextResponse.json(newChallenge);
}
