import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsSentimentBreakdown } from "@/components/NewsSentimentBreakdown";
import { sentimentDistribution, sentimentPercentages } from "@/lib/news-sentiment";
import { SentimentWidget } from "@/components/SentimentWidget";
import { clearMockData, setMockData } from "./setup";

describe("brief sentiment coverage", () => {
  it("shows the missing 88% from the reported 24-article snapshot", () => {
    const html = renderToStaticMarkup(<NewsSentimentBreakdown newsCount={24} breakdown={{ positive: 4, neutral: 8, negative: 0, unknown: 88 }} />);
    expect(html).toContain("Not analysed 88%");
    expect(html).toContain("24 articles in this brief");
    expect(html).toContain("0 0 88%");
    expect(html).not.toContain("today");
  });

  it("uses exact counts when present without guessing counts from old percentages", () => {
    const breakdown = { positive: 4, neutral: 8, negative: 0, unknown: 88, counts: { positive: 1, neutral: 2, negative: 0, unknown: 21 } };
    const html = renderToStaticMarkup(<NewsSentimentBreakdown newsCount={24} breakdown={breakdown} />);
    expect(html).toContain("3 of 24 articles analysed");
    expect(html).toContain("21 not analysed");
    expect(sentimentDistribution({ ...breakdown, counts: { ...breakdown.counts, unknown: 20 } }, 24).counts).toBeNull();
  });

  it("keeps rounded thirds and legacy 101% totals within a complete 100% bar", () => {
    for (const weights of [{ positive: 1, neutral: 1, negative: 1 }, { positive: 30, neutral: 32, negative: 37, unknown: 2 }, { positive: 1, neutral: 0, negative: 7 }]) {
      const percentages = Object.values(sentimentPercentages(weights));
      expect(percentages.reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(percentages.every(value => value >= 0 && value <= 100)).toBe(true);
    }
  });

  it("does not derive a bullish mood from a rounding tie in the live widget", async () => {
    clearMockData();
    setMockData("news_articles", [
      { id: 1, event_key: "a", ai_sentiment: "positive", summary_method: "verified_ai", quality_version: 2 },
      { id: 2, event_key: "b", ai_sentiment: "neutral", summary_method: "verified_ai", quality_version: 2 },
      { id: 3, event_key: "c", ai_sentiment: "negative", summary_method: "verified_ai", quality_version: 2 },
    ]);
    const html = renderToStaticMarkup(await SentimentWidget());
    expect(html).toContain("3 analysed stories");
    expect(html).not.toMatch(/Slightly Bullish|Slightly Bearish/);
    clearMockData();
  });

  it("does not turn an entirely unanalysed or empty sample into neutral sentiment", () => {
    expect(sentimentDistribution({}, 24).percentages.unknown).toBe(100);
    const html = renderToStaticMarkup(<NewsSentimentBreakdown newsCount={0} breakdown={{}} />);
    expect(html).toContain("No articles in this brief");
    expect(html).not.toContain('role="img"');
  });
});
