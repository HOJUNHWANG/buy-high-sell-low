import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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

  // Claim through one server-only database transaction. It serializes claims
  // per user/day, checks the tier and quota, then inserts the permanent unlock.
  // Authenticated clients intentionally have no direct INSERT policy.
  const admin = createSupabaseAdmin();
  const { data: claimRows, error: claimError } = await admin.rpc(
    "claim_summary_unlock",
    {
      p_user_id: user.id,
      p_article_id: articleId,
      p_daily_limit: FREE_USER_DAILY_UNLOCKS,
    },
  );
  if (claimError) {
    console.error("Summary unlock claim failed:", claimError.message);
    return NextResponse.json(
      { error: "Failed to save article unlock" },
      { status: 503 },
    );
  }

  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (claim?.outcome === "limit_reached") {
    return NextResponse.json(
      {
        error: `Daily unlock limit reached (${FREE_USER_DAILY_UNLOCKS}/${FREE_USER_DAILY_UNLOCKS}). Resets tomorrow.`,
        remaining: 0,
      },
      { status: 429 },
    );
  }
  if (!claim || !["unlocked", "already_unlocked"].includes(claim.outcome)) {
    console.error("Summary unlock claim returned an unexpected outcome.");
    return NextResponse.json(
      { error: "Failed to save article unlock" },
      { status: 503 },
    );
  }

  const remaining = typeof claim.remaining === "number"
    ? claim.remaining
    : undefined;

  return NextResponse.json({
    summary: article.ai_summary,
    insight: article.ai_insight,
    sentiment: article.ai_sentiment,
    caution: article.ai_caution,
    remaining,
  });
}
