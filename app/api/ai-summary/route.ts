import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DAILY_LIMIT = 30;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check
  const today = new Date().toISOString().split("T")[0];
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  if ((usage?.count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Daily limit reached (30/30). Resets tomorrow." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const articleId = (body as Record<string, unknown>)?.articleId;
  if (!articleId || typeof articleId !== "number" || !Number.isInteger(articleId) || articleId <= 0) {
    return NextResponse.json({ error: "articleId must be a positive integer" }, { status: 400 });
  }

  // Fetch article
  const { data: article } = await supabase
    .from("news_articles")
    .select("title, ai_summary, ai_insight, ai_sentiment")
    .eq("id", articleId)
    .single();

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Return cached summary if available
  if (article.ai_summary) {
    return NextResponse.json({
      summary: article.ai_summary,
      insight: article.ai_insight,
      sentiment: article.ai_sentiment,
    });
  }

  // Generate new summary
  const prompt = `Analyze the following financial news for a general investor audience.

[STRICT RULES]
- Never recommend buying or selling any specific stock
- No investment advice or price predictions
- Facts and analysis only
- Output JSON only, no other text

[Output Format]
{
  "summary": "2-3 sentence plain English summary",
  "impact": "one sentence: likely effect on stock price and why",
  "sentiment": "positive | neutral | negative",
  "caution": "one thing investors might overlook (null if none)"
}

Title: ${article.title}`;

  let result;
  try {
    const msg = await claude.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    result = JSON.parse((msg.content[0] as { text: string }).text);
  } catch {
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  // Cache result
  await supabase
    .from("news_articles")
    .update({
      ai_summary:      result.summary,
      ai_insight:      result.impact,
      ai_sentiment:    result.sentiment,
      ai_generated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  // Increment usage
  await supabase.from("ai_usage").upsert(
    { user_id: user.id, date: today, count: (usage?.count ?? 0) + 1 },
    { onConflict: "user_id,date" }
  );

  return NextResponse.json({
    summary:   result.summary,
    insight:   result.impact,
    sentiment: result.sentiment,
  });
}
