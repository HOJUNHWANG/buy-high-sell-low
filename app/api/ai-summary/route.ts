import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const DAILY_LIMIT = 30;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const articleId = (body as Record<string, unknown>)?.articleId;
  if (!articleId || typeof articleId !== "number" || !Number.isInteger(articleId) || articleId < 1) {
    return NextResponse.json({ error: "articleId must be a positive integer" }, { status: 400 });
  }

  // Fetch article
  let article: { title: string; ai_summary: string | null; ai_insight: string | null; ai_sentiment: string | null; ai_caution: string | null } | null = null;
  try {
    const { data } = await supabase
      .from("news_articles")
      .select("title, ai_summary, ai_insight, ai_sentiment, ai_caution")
      .eq("id", articleId)
      .single();
    article = data;
  } catch {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Return cached summary if available
  if (article.ai_summary) {
    return NextResponse.json({
      summary:         article.ai_summary,
      insight:         article.ai_insight,
      sentiment:       article.ai_sentiment,
      caution:         article.ai_caution,
    });
  }

  // Atomically claim a usage slot BEFORE generating to prevent race conditions.
  // Read current count and increment immediately; refund on generation failure.
  const today = new Date().toISOString().split("T")[0];
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  const currentCount = usage?.count ?? 0;
  if (currentCount >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Resets tomorrow.` },
      { status: 429 }
    );
  }

  // Increment BEFORE generation so concurrent requests can't both slip through
  await supabase.from("ai_usage").upsert(
    { user_id: user.id, date: today, count: currentCount + 1 },
    { onConflict: "user_id,date" }
  );

  // Generate new summary
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const prompt = `Summarize this financial news in JSON. No investment advice.
{
  "summary": "2-3 sentence summary",
  "impact": "1 sentence market effect",
  "sentiment": "positive|neutral|negative",
  "caution": "1 overlooked risk or null"
}

${article.title}`;

  let result;
  try {
    const msg = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    result = JSON.parse(msg.choices[0].message.content ?? "{}");
  } catch {
    // Refund the usage slot on generation failure
    await supabase.from("ai_usage").upsert(
      { user_id: user.id, date: today, count: currentCount },
      { onConflict: "user_id,date" }
    );
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  // Cache result
  await supabase
    .from("news_articles")
    .update({
      ai_summary:      result.summary   ?? null,
      ai_insight:      result.impact    ?? null,
      ai_sentiment:    result.sentiment ?? null,
      ai_caution:      result.caution   ?? null,
      ai_generated_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  return NextResponse.json({
    summary:         result.summary   ?? null,
    insight:         result.impact    ?? null,
    sentiment:       result.sentiment ?? null,
    caution:         result.caution   ?? null,
  });
}
