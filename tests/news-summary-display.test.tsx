import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeNewsCard } from "@/components/HomeNewsCard";
import { gateSummaries } from "@/lib/summary-gate";
import type { NewsArticle } from "@/lib/types";

const article = (overrides: Partial<NewsArticle> = {}): NewsArticle => ({
  id: 1, ticker: "AAPL", title: "Apple earnings", url: "https://example.test/article",
  source: "Example", published_at: "2026-10-31T20:00:00Z", fetched_at: "2026-10-31T20:01:00Z",
  ai_summary: null, ai_insight: null, ai_sentiment: null, ai_caution: null, ai_generated_at: null,
  summary_method: "headline_only", source_coverage: "headline", quality_version: 2, ...overrides,
});
const render = (row: NewsArticle, loggedIn: boolean) => renderToStaticMarkup(
  <HomeNewsCard article={gateSummaries([row], loggedIn ? "free" : "guest")[0]} isLoggedIn={loggedIn} />,
);

describe("news summary availability", () => {
  it.each([true, false])("does not pretend a missing body is generating (logged in: %s)", loggedIn => {
    const html = render(article(), loggedIn);
    expect(html).toContain("Headline only");
    expect(html).toContain("Full article text was unavailable");
    expect(html).toContain("Read original article");
    expect(html).not.toMatch(/Generating|Sign up free|⏳/);
  });

  it("does not promise a summary for an unverified legacy record", () => {
    const html = render(article({ summary_method: "legacy_unverified", quality_version: 0, ai_summary: "Unsupported old analysis" }), true);
    expect(html).toContain("Summary unavailable");
    expect(html).not.toMatch(/Unsupported old analysis|Generating/);
  });

  it("labels an available source excerpt and preserves its text", () => {
    const html = render(article({ summary_method: "source_excerpt", source_coverage: "lead", ai_summary: "Apple reported higher revenue." }), true);
    expect(html).toContain("Source excerpt");
    expect(html).toContain("Apple reported higher revenue.");
    expect(html).not.toMatch(/Generating|Read original article|>AI</);
  });

  it("labels a verified summary and keeps the existing access gate", () => {
    const row = article({ summary_method: "verified_ai", ai_summary: "Apple reported higher revenue." });
    expect(render(row, true)).toContain("Source checked");
    const locked = gateSummaries([row, { ...row, id: 2 }], "guest")[1];
    const html = renderToStaticMarkup(<HomeNewsCard article={locked} isLoggedIn={false} />);
    expect(html).toContain("Sign up free to unlock");
    expect(html).not.toContain("Generating");
  });
});
