/**
 * QA Tests: Summary Gating Logic
 * Covers tier-based access, unlock persistence, and quota enforcement.
 */
import { describe, it, expect } from "vitest";
import { gateSummaries, GUEST_FREE_SUMMARIES, FREE_USER_FREE_SUMMARIES } from "@/lib/summary-gate";
import type { NewsArticle } from "@/lib/types";

function makeArticle(id: number, hasSummary: boolean): NewsArticle {
  return {
    id,
    ticker: "AAPL",
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    source: "Test",
    published_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    ai_summary: hasSummary ? `Summary ${id}` : null,
    ai_insight: hasSummary ? `Insight ${id}` : null,
    ai_sentiment: hasSummary ? "positive" : null,
    ai_caution: null,
    ai_generated_at: hasSummary ? new Date().toISOString() : null,
  } as NewsArticle;
}

describe("gateSummaries", () => {
  it("premium tier returns all articles unchanged", () => {
    const articles = Array.from({ length: 10 }, (_, i) => makeArticle(i + 1, true));
    const result = gateSummaries(articles, "premium");
    expect(result.every(a => a.ai_summary !== null)).toBe(true);
  });

  it("guest tier shows only 1 free summary", () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1, true));
    const result = gateSummaries(articles, "guest");
    const unlocked = result.filter(a => a.ai_summary !== null);
    expect(unlocked).toHaveLength(GUEST_FREE_SUMMARIES);
  });

  it("free tier shows 5 free summaries", () => {
    const articles = Array.from({ length: 10 }, (_, i) => makeArticle(i + 1, true));
    const result = gateSummaries(articles, "free");
    const unlocked = result.filter(a => a.ai_summary !== null);
    expect(unlocked).toHaveLength(FREE_USER_FREE_SUMMARIES);
  });

  it("articles without summary are never locked", () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1, false));
    const result = gateSummaries(articles, "guest");
    expect(result.every(a => !(a as Record<string, unknown>).summaryLocked)).toBe(true);
  });

  it("previously unlocked articles always shown", () => {
    const articles = Array.from({ length: 10 }, (_, i) => makeArticle(i + 1, true));
    const unlockedIds = new Set([6, 7, 8, 9, 10]); // unlock the ones that would be locked
    const result = gateSummaries(articles, "free", unlockedIds);
    const unlocked = result.filter(a => a.ai_summary !== null);
    expect(unlocked).toHaveLength(10); // 5 free + 5 unlocked
  });

  it("locked articles have summaryLocked flag", () => {
    const articles = Array.from({ length: 3 }, (_, i) => makeArticle(i + 1, true));
    const result = gateSummaries(articles, "guest");
    const locked = result.filter(a => (a as Record<string, unknown>).summaryLocked);
    expect(locked).toHaveLength(2); // 3 total - 1 free = 2 locked
  });

  it("locked articles have AI fields stripped", () => {
    const articles = Array.from({ length: 3 }, (_, i) => makeArticle(i + 1, true));
    const result = gateSummaries(articles, "guest");
    const locked = result.filter(a => (a as Record<string, unknown>).summaryLocked);
    for (const a of locked) {
      expect(a.ai_summary).toBeNull();
      expect(a.ai_insight).toBeNull();
      expect(a.ai_caution).toBeNull();
    }
  });

  it("empty articles array returns empty", () => {
    const result = gateSummaries([], "free");
    expect(result).toEqual([]);
  });

  it("articles without summary don't consume free quota", () => {
    // Mix: 3 with summary, 7 without
    const articles = [
      makeArticle(1, false), // no summary
      makeArticle(2, true),  // free #1
      makeArticle(3, false), // no summary
      makeArticle(4, true),  // free #2 (for guest, this would be locked)
      makeArticle(5, true),  // locked for guest
    ];
    const result = gateSummaries(articles, "guest");
    // Guest gets 1 free: article 2
    expect(result[1].ai_summary).toBe("Summary 2");
    // Article 4 should be locked (guest only gets 1)
    expect((result[3] as Record<string, unknown>).summaryLocked).toBe(true);
  });
});
