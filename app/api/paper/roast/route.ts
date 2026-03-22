import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const DAILY_LIMIT = 1;

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit check (1/day)
  const today = new Date().toISOString().split("T")[0];
  const { data: usage } = await supabase
    .from("paper_ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  const currentCount = usage?.count ?? 0;
  if (currentCount >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "You've already been roasted today. Come back tomorrow for more humiliation." },
      { status: 429 }
    );
  }

  // Atomically claim slot
  await supabase.from("paper_ai_usage").upsert(
    { user_id: user.id, date: today, count: currentCount + 1 },
    { onConflict: "user_id,date" }
  );

  // Fetch portfolio data
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  const { data: positions } = await supabase
    .from("paper_positions")
    .select("ticker, shares, avg_cost")
    .eq("user_id", user.id);

  const tickers = (positions ?? []).map((p: { ticker: string }) => p.ticker);
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    prices = Object.fromEntries((priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
  }

  const cashBalance = account?.cash_balance ?? 1000;
  const holdingsStr = (positions ?? []).map((p: { ticker: string; shares: number; avg_cost: number }) => {
    const current = prices[p.ticker] ?? p.avg_cost;
    const pnl = ((current - p.avg_cost) / p.avg_cost * 100).toFixed(1);
    return `${p.ticker}: ${p.shares.toFixed(2)} shares @ $${p.avg_cost.toFixed(2)} avg, now $${current.toFixed(2)} (${Number(pnl) >= 0 ? "+" : ""}${pnl}%)`;
  }).join("\n");

  const totalValue = cashBalance + (positions ?? []).reduce(
    (sum: number, p: { ticker: string; shares: number }) => sum + p.shares * (prices[p.ticker] ?? 0),
    0
  );
  const returnPct = ((totalValue - 1000) / 1000 * 100).toFixed(2);

  const prompt = `You are a brutally honest, sarcastic financial roast comedian. Roast this paper trading portfolio. Be funny and sharp but not mean-spirited. Reference specific positions when possible. Keep it under 150 words.

Portfolio (started with $1,000):
- Cash: $${cashBalance.toFixed(2)}
${holdingsStr ? `- Holdings:\n${holdingsStr}` : "- No holdings (sitting in cash like a coward)"}
- Total Value: $${totalValue.toFixed(2)}
- Overall Return: ${Number(returnPct) >= 0 ? "+" : ""}${returnPct}%

Output JSON only:
{
  "roast": "your roast text here",
  "grade": "letter grade A+ to F",
  "nickname": "a funny trader nickname for this person"
}`;

  let result;
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const msg = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    result = JSON.parse(msg.choices[0].message.content ?? "{}");
  } catch {
    // Refund usage slot on failure
    await supabase.from("paper_ai_usage").upsert(
      { user_id: user.id, date: today, count: currentCount },
      { onConflict: "user_id,date" }
    );
    return NextResponse.json({ error: "AI roast generation failed" }, { status: 500 });
  }

  return NextResponse.json({
    roast: result.roast ?? "I'm speechless. And that's saying something.",
    grade: result.grade ?? "?",
    nickname: result.nickname ?? "The Mystery Trader",
  });
}
