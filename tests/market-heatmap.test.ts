import { describe, expect, it } from "vitest";
import type { MarketStock } from "@/lib/cached-data";
import { getHeatmapStocks, getMarketHeatmap } from "@/lib/market-heatmap";

const fetchedAt = "2026-11-20T15:00:00Z";

function stock(ticker: string, sector: string | null, cap: number | null, overrides: Partial<MarketStock> = {}): MarketStock {
  return {
    ticker,
    name: ticker,
    sector,
    market_cap: cap,
    market_cap_metric: null,
    market_cap_source: null,
    market_cap_updated_at: null,
    is_active: true,
    exchange: "NASDAQ",
    logo_url: null,
    updated_at: fetchedAt,
    stock_prices: { ticker, price: 100, volume: null, change_pct: 1, fetched_at: fetchedAt },
    ...overrides,
  };
}

describe("stock heatmap", () => {
  it("includes active equities with legacy metadata and excludes funds and crypto", () => {
    const { stocks, latestQuote } = getHeatmapStocks([
      stock("AAPL", "Technology", 300),
      stock("ANT", "Information Technology", 100, { stock_prices: null }),
      stock("NEW", null, null),
      stock("JPM", "Financial Services", 200),
      stock("SPY", "ETF", 1_000),
      stock("QQQ", null, 1_000, { market_cap_metric: "aum" }),
      stock("BTC-USD", null, 1_000),
      stock("ETH", "Cryptocurrency", 1_000),
      stock("OLD", "Technology", 1_000, { is_active: false }),
    ]);

    const { groups, withoutMarketCap } = getMarketHeatmap(stocks);
    expect(stocks).toHaveLength(4);
    expect(groups.map(group => group.name)).toEqual(["Technology", "Financial Services"]);
    expect(groups[0].stocks.map(({ item }) => [item.ticker, item.change])).toEqual([["AAPL", 1], ["ANT", null]]);
    expect(withoutMarketCap.map(({ ticker }) => ticker)).toEqual(["NEW"]);
    expect(latestQuote).toBe(Date.parse(fetchedAt));

    for (const view of ["desktop", "mobile"] as const) {
      const { width, height } = groups[0][view];
      const largest = groups[0].stocks[0][view];
      expect(width * height).toBeCloseTo(400 / 600);
      expect(largest.width * largest.height).toBeCloseTo(300 / 400);
    }
  });

  it("takes the new quote and keeps the same tile area when market cap is unchanged", () => {
    const apple = stock("AAPL", "Technology", 300);
    const snapshot = [apple, stock("ANT", "Technology", 100)];
    const refreshedAt = "2026-11-20T15:10:00Z";
    const before = getMarketHeatmap(getHeatmapStocks(snapshot).stocks).groups[0].stocks[0];
    const refreshed = getHeatmapStocks([
      { ...apple, stock_prices: { ...apple.stock_prices!, change_pct: -2.5, fetched_at: refreshedAt } },
      snapshot[1],
    ]);
    const after = getMarketHeatmap(refreshed.stocks).groups[0].stocks[0];

    expect(after.item.change).toBe(-2.5);
    expect(refreshed.latestQuote).toBe(Date.parse(refreshedAt));
    expect(after.desktop).toEqual(before.desktop);
    expect(after.mobile).toEqual(before.mobile);
  });
});
