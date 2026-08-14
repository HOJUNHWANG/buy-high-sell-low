import { describe, expect, it } from "vitest";
import {
  getLeaderStreaks,
  type MarketCapDailyLeader,
} from "@/lib/market-leader-streaks";

const stocks = [
  { ticker: "NVDA", sector: "Technology", market_cap: 5_400_000_000_000 },
  { ticker: "MSFT", sector: "Technology", market_cap: 4_000_000_000_000 },
  { ticker: "VOO", sector: "ETF", market_cap: 1_000_000_000_000 },
  { ticker: "SPY", sector: "ETF", market_cap: 900_000_000_000 },
];

function leadersFor(days: number): MarketCapDailyLeader[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 14 - index))
      .toISOString()
      .split("T")[0];
    return [
      { date, asset_type: "stocks" as const, ticker: "NVDA" },
      { date, asset_type: "etfs" as const, ticker: "VOO" },
    ];
  }).flat();
}

describe("getLeaderStreaks", () => {
  it("counts every daily leader row beyond the former raw-query limit", () => {
    expect(getLeaderStreaks(stocks, leadersFor(14))).toEqual({
      NVDA: 14,
      VOO: 14,
    });
  });

  it("stops at the first date led by another asset", () => {
    const leaders = leadersFor(5);
    const priorStockLeader = leaders.find(
      (leader) => leader.date === "2026-08-11" && leader.asset_type === "stocks",
    );
    if (priorStockLeader) priorStockLeader.ticker = "MSFT";

    expect(getLeaderStreaks(stocks, leaders)).toEqual({
      NVDA: 3,
      VOO: 5,
    });
  });

  it("does not invent a streak when a category is missing on the latest date", () => {
    const leaders = leadersFor(2).filter(
      (leader) => !(leader.date === "2026-08-14" && leader.asset_type === "etfs"),
    );

    expect(getLeaderStreaks(stocks, leaders)).toEqual({ NVDA: 2 });
  });
});
