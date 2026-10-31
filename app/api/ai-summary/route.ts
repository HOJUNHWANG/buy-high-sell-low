import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  let article: { title: string; ai_summary: string | null; ai_insight: string | null; ai_sentiment: string | null; ai_caution: string | null; summary_method: string; source_coverage: string } | null = null;
  try {
    const { data } = await supabase
      .from("news_articles")
      .select("title, ai_summary, ai_insight, ai_sentiment, ai_caution, summary_method, source_coverage")
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
  if (article.ai_summary && ["verified_ai", "source_excerpt"].includes(article.summary_method)) {
    return NextResponse.json({
      summary:         article.ai_summary,
      insight:         article.ai_insight,
      sentiment:       article.ai_sentiment,
      caution:         article.ai_caution,
      summaryMethod: article.summary_method, sourceCoverage: article.source_coverage,
    });
  }

  return NextResponse.json({ error: "Source-checked summary is not available for this article yet.", status: "insufficient_source", summaryMethod: article.summary_method }, { status: 409 });
}
