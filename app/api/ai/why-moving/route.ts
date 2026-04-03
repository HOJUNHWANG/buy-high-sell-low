import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ticker = body.ticker as string | undefined;
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // Rate limit: 1/day per user per ticker
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("ai_why_usage")
    .select("ticker")
    .eq("user_id", user.id)
    .eq("date", today)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Already analyzed today. Check back tomorrow." },
      { status: 429 }
    );
  }

  // Claim slot before Groq call
  await supabase.from("ai_why_usage").insert({ user_id: user.id, date: today, ticker });

  // Fetch price data
  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("price, change_pct")
    .eq("ticker", ticker)
    .single();

  // Fetch related recent news
  const { data: news } = await supabase
    .from("news_articles")
    .select("title, published_at, ai_sentiment")
    .contains("related_tickers", [ticker])
    .order("published_at", { ascending: false })
    .limit(8);

  const newsStr = (news ?? [])
    .map((n: { title: string; ai_sentiment: string | null }) =>
      `- ${n.title}${n.ai_sentiment ? ` [${n.ai_sentiment}]` : ""}`)
    .join("\n");

  const changeStr = priceData?.change_pct != null
    ? `${priceData.change_pct >= 0 ? "+" : ""}${priceData.change_pct.toFixed(2)}%`
    : "N/A";

  const prompt = `You are a financial analyst. Explain concisely why ${ticker} is moving today.

Price: $${priceData?.price?.toFixed(2) ?? "N/A"} (${changeStr} today)

Recent news:
${newsStr || "No recent ticker-specific news found."}

Respond in JSON only:
{
  "headline": "one sentence explaining the primary driver of today's move",
  "drivers": ["key driver 1", "key driver 2", "key driver 3"],
  "sentiment": "bullish|bearish|neutral",
  "outlook": "one sentence short-term outlook based on current data"
}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const msg = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const result = JSON.parse(msg.choices[0].message.content ?? "{}");
    return NextResponse.json({
      headline: result.headline ?? "Insufficient data to explain today's movement.",
      drivers: Array.isArray(result.drivers) ? result.drivers : [],
      sentiment: result.sentiment ?? "neutral",
      outlook: result.outlook ?? "",
      price: priceData?.price ?? null,
      changePct: priceData?.change_pct ?? null,
    });
  } catch {
    // Refund slot on failure
    await supabase.from("ai_why_usage")
      .delete()
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("ticker", ticker);
    return NextResponse.json({ error: "AI analysis failed. Try again." }, { status: 500 });
  }
}
