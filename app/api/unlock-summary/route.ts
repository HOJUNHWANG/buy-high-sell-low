import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { FREE_USER_DAILY_UNLOCKS } from "@/lib/summary-gate";

/**
 * POST /api/unlock-summary
 * Permanently unlocks a gated AI summary for a logged-in free user.
 * Counts against daily unlock limit. Already-unlocked articles are free.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

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

  // Check if already unlocked (permanent — no limit consumed)
  const { data: existing } = await supabase
    .from("summary_unlocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("article_id", articleId)
    .single();

  // Fetch article AI data
  const { data: article } = await supabase
    .from("news_articles")
    .select("ai_summary, ai_insight, ai_sentiment, ai_caution")
    .eq("id", articleId)
    .single();

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (!article.ai_summary) {
    return NextResponse.json({ error: "No AI summary available for this article" }, { status: 404 });
  }

  if (existing) {
    // Already unlocked — return data without consuming quota
    return NextResponse.json({
      summary: article.ai_summary,
      insight: article.ai_insight,
      sentiment: article.ai_sentiment,
      caution: article.ai_caution,
    });
  }

  // Check if user is premium (skip daily limit)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .single();

  const isPremium = profile?.tier === "premium";

  if (!isPremium) {
    // Check daily unlock count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("summary_unlocks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("unlocked_at", todayStart.toISOString());

    const todayCount = count ?? 0;
    if (todayCount >= FREE_USER_DAILY_UNLOCKS) {
      return NextResponse.json(
        {
          error: `Daily unlock limit reached (${FREE_USER_DAILY_UNLOCKS}/${FREE_USER_DAILY_UNLOCKS}). Resets tomorrow.`,
          remaining: 0,
        },
        { status: 429 },
      );
    }
  }

  // Record permanent unlock
  await supabase.from("summary_unlocks").insert({
    user_id: user.id,
    article_id: articleId,
  });

  // Calculate remaining
  let remaining: number | undefined;
  if (!isPremium) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("summary_unlocks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("unlocked_at", todayStart.toISOString());
    remaining = FREE_USER_DAILY_UNLOCKS - (count ?? 0);
  }

  return NextResponse.json({
    summary: article.ai_summary,
    insight: article.ai_insight,
    sentiment: article.ai_sentiment,
    caution: article.ai_caution,
    remaining,
  });
}
