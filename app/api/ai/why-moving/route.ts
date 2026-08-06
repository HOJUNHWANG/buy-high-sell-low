import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { formatAssetPrice } from "@/lib/price-format";
import {
  getGroqCompletionSettings,
  getGroqJsonResponseFormat,
} from "@/lib/groq";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const WHY_MOVING_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    drivers: {
      type: "array",
      items: { type: "string" },
    },
    sentiment: {
      type: "string",
      enum: ["bullish", "bearish", "neutral"],
    },
    outlook: { type: "string" },
  },
  required: ["headline", "drivers", "sentiment", "outlook"],
  additionalProperties: false,
};

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

  const rawTicker = body.ticker;
  const ticker = typeof rawTicker === "string"
    ? rawTicker.trim().toUpperCase()
    : "";
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  if (!/^[A-Z0-9][A-Z0-9./-]{0,14}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  // Fetch price data before claiming the user's daily slot. Pending/newly listed
  // tickers can exist in stocks before quotes are available.
  const { data: priceData } = await supabase
    .from("stock_prices")
    .select("price, change_pct")
    .eq("ticker", ticker)
    .maybeSingle();

  if (!priceData) {
    return NextResponse.json(
      { error: "Price data is not available for this ticker yet." },
      { status: 409 }
    );
  }

  // Claim the daily slot atomically. The composite primary key prevents two
  // concurrent requests from both passing a separate read-before-write check.
  // Use the server-only client so authenticated users cannot delete their own
  // usage rows through PostgREST and bypass the daily limit.
  const today = new Date().toISOString().split("T")[0];
  const admin = createSupabaseAdmin();
  const { error: claimError } = await admin
    .from("ai_why_usage")
    .insert({ user_id: user.id, date: today, ticker });

  if (claimError?.code === "23505") {
    return NextResponse.json(
      { error: "Already analyzed today. Check back tomorrow." },
      { status: 429 }
    );
  }
  if (claimError) {
    console.error("AI movement slot claim failed:", claimError.message);
    return NextResponse.json(
      { error: "Unable to start analysis. Try again." },
      { status: 503 },
    );
  }

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

Price: ${priceData?.price == null ? "N/A" : formatAssetPrice(priceData.price, ticker)} (${changeStr} today)

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
      ...getGroqCompletionSettings(),
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      response_format: getGroqJsonResponseFormat(
        "stock_movement_analysis",
        WHY_MOVING_SCHEMA
      ),
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
    await admin.from("ai_why_usage")
      .delete()
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("ticker", ticker);
    return NextResponse.json({ error: "AI analysis failed. Try again." }, { status: 500 });
  }
}
