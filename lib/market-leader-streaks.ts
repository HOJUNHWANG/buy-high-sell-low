import type { Stock } from "@/lib/types";

export type RankedAssetType = "stocks" | "etfs";

export interface MarketCapDailyLeader {
  ticker: string;
  date: string;
  asset_type: RankedAssetType;
}

type RankedStock = Pick<Stock, "ticker" | "sector" | "market_cap">;

function assetType(stock: Pick<Stock, "sector">): RankedAssetType | "crypto" {
  if (stock.sector === "Cryptocurrency") return "crypto";
  if (stock.sector === "ETF") return "etfs";
  return "stocks";
}

export function getLeaderStreaks(
  stocks: RankedStock[],
  dailyLeaders: MarketCapDailyLeader[],
) {
  const currentLeaders = new Map<RankedAssetType, string>();
  for (const type of ["stocks", "etfs"] as const) {
    const leader = stocks
      .filter((stock) => assetType(stock) === type && stock.market_cap != null)
      .sort((left, right) => {
        const capDifference = (right.market_cap ?? 0) - (left.market_cap ?? 0);
        return capDifference || left.ticker.localeCompare(right.ticker);
      })[0];
    if (leader) currentLeaders.set(type, leader.ticker);
  }

  const leadersByDate = new Map<string, Map<RankedAssetType, string>>();
  for (const leader of dailyLeaders) {
    const day = leadersByDate.get(leader.date) ?? new Map();
    day.set(leader.asset_type, leader.ticker);
    leadersByDate.set(leader.date, day);
  }

  const dates = [...leadersByDate.keys()].sort().reverse();
  const streaks: Record<string, number> = {};
  for (const [type, ticker] of currentLeaders) {
    let streak = 0;
    for (const date of dates) {
      if (leadersByDate.get(date)?.get(type) !== ticker) break;
      streak += 1;
    }
    if (streak) streaks[ticker] = streak;
  }

  return streaks;
}
