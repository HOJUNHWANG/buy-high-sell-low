import type { NewsArticle } from "./types";

/** How many AI summaries are shown free (without unlock) per page load */
export const GUEST_FREE_SUMMARIES = 1;
export const FREE_USER_FREE_SUMMARIES = 5;
export const FREE_USER_DAILY_UNLOCKS = 3;

export type UserTier = "guest" | "free" | "premium";

/**
 * Strip AI fields from articles that exceed the user's free quota.
 * Articles the user has already unlocked remain visible.
 *
 * @param articles - sorted by published_at DESC (newest first)
 * @param tier - user tier
 * @param unlockedIds - set of article IDs this user has previously unlocked
 */
export function gateSummaries(
  articles: NewsArticle[],
  tier: UserTier,
  unlockedIds: Set<number> = new Set(),
): NewsArticle[] {
  // Legacy fields are unverified regardless of membership or previous unlocks.
  const checked = articles.map(a => ["verified_ai", "source_excerpt"].includes(a.summary_method ?? "") && (a.quality_version ?? 0) >= 2
    ? a : { ...a, ai_summary: null, ai_insight: null, ai_sentiment: null, ai_caution: null, summaryLocked: false });
  // Logged-in users see all source-checked summaries.
  if (tier === "free" || tier === "premium") return checked;

  // Guest: only GUEST_FREE_SUMMARIES articles shown unlocked
  let freeUsed = 0;
  return checked.map((a) => {
    if (!a.ai_summary || a.summary_method === "source_excerpt" || a.summary_method === "headline_only") return a;
    if (unlockedIds.has(a.id)) return a;
    if (freeUsed < GUEST_FREE_SUMMARIES) { freeUsed++; return a; }
    return { ...a, ai_summary: null, ai_insight: null, ai_caution: null, summaryLocked: true };
  });
}
