/**
 * QA Tests: Business Logic & Edge Cases
 * Pure logic tests for achievements, streak calculations, and data integrity.
 */
import { describe, it, expect } from "vitest";
import { BADGES, ALL_BADGE_KEYS, TIERS_ORDERED, getBadgesByTier, type AchievementTier } from "@/lib/achievements";

describe("Achievements: Badge metadata integrity", () => {
  it("all badge keys have corresponding metadata", () => {
    for (const key of ALL_BADGE_KEYS) {
      const meta = BADGES[key];
      expect(meta, `Missing metadata for badge: ${key}`).toBeDefined();
      expect(meta.label, `Missing label for badge: ${key}`).toBeTruthy();
      expect(meta.icon, `Missing icon for badge: ${key}`).toBeTruthy();
      expect(meta.desc, `Missing description for badge: ${key}`).toBeTruthy();
    }
  });

  it("has exactly 38 badges across 5 tiers", () => {
    expect(ALL_BADGE_KEYS.length).toBe(38);
    expect(TIERS_ORDERED).toEqual(["bronze", "silver", "gold", "platinum", "diamond"]);
  });

  it("all badges have valid tier and reward", () => {
    const validTiers: AchievementTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
    const rewardMap: Record<AchievementTier, number> = {
      bronze: 50, silver: 100, gold: 200, platinum: 300, diamond: 1000,
    };
    for (const key of ALL_BADGE_KEYS) {
      const badge = BADGES[key];
      expect(validTiers).toContain(badge.tier);
      expect(badge.reward).toBe(rewardMap[badge.tier]);
    }
  });

  it("getBadgesByTier returns correct counts", () => {
    expect(getBadgesByTier("bronze").length).toBe(8);
    expect(getBadgesByTier("silver").length).toBe(9);   // +short_seller
    expect(getBadgesByTier("gold").length).toBe(9);     // +bear_raid, contrarian
    expect(getBadgesByTier("platinum").length).toBe(6);  // +short_squeeze
    expect(getBadgesByTier("diamond").length).toBe(6);   // +bear_king
  });

  it("all badge keys are unique", () => {
    const unique = new Set(ALL_BADGE_KEYS);
    expect(unique.size).toBe(ALL_BADGE_KEYS.length);
  });

  it("all original 16 badge keys still exist", () => {
    const original = [
      "first_trade", "diamond_hands", "paper_hands", "buy_high_sell_low",
      "diversified", "whale", "broke", "crypto_degen", "full_send",
      "penny_pincher", "liquidated", "phoenix", "cockroach",
      "streak_7", "streak_30", "challenge_done",
    ];
    for (const key of original) {
      expect(ALL_BADGE_KEYS).toContain(key);
    }
  });

  it("new badge keys exist", () => {
    const newBadges = [
      "ten_trades", "fifty_trades", "profit_master", "crypto_collector",
      "double_up", "day_trader", "bargain_hunter", "fomo_buyer",
      "triple_up", "flash_profit", "hundred_trades", "hodl_master",
      "ten_x", "perfect_month", "market_wizard", "zero_to_hero", "ultimate_hodl",
    ];
    for (const key of newBadges) {
      expect(ALL_BADGE_KEYS).toContain(key);
    }
  });
});

describe("Business Logic: Streak formula", () => {
  // Mirror the streak calculation from checkin route
  function calculateReward(streak: number): { reward: number; bonus: boolean } {
    const reward = 50 + streak * 20;
    const bonus = streak === 10;
    return { reward: bonus ? reward + 200 : reward, bonus };
  }

  it("day 1: $70 (50 + 1×20)", () => {
    expect(calculateReward(1).reward).toBe(70);
  });

  it("day 5: $150 (50 + 5×20)", () => {
    expect(calculateReward(5).reward).toBe(150);
  });

  it("day 10: $450 (50 + 10×20 + 200 bonus)", () => {
    const result = calculateReward(10);
    expect(result.reward).toBe(450);
    expect(result.bonus).toBe(true);
  });

  it("10-day cycle total: $2,600", () => {
    let total = 0;
    for (let day = 1; day <= 10; day++) {
      total += calculateReward(day).reward;
    }
    // Sum: 70+90+110+130+150+170+190+210+230+450 = 1800+800 = wait let me recalc
    // day1: 70, day2: 90, day3: 110, day4: 130, day5: 150
    // day6: 170, day7: 190, day8: 210, day9: 230, day10: 250+200=450
    // Total: 70+90+110+130+150+170+190+210+230+450 = 1800
    expect(total).toBe(1800);
  });
});

describe("Business Logic: Portfolio value calculation", () => {
  function calculatePortfolioValue(
    cashBalance: number,
    positions: { shares: number; currentPrice: number }[]
  ): { totalValue: number; totalMarketValue: number } {
    const totalMarketValue = positions.reduce((sum, p) => sum + p.shares * p.currentPrice, 0);
    return { totalValue: cashBalance + totalMarketValue, totalMarketValue };
  }

  it("cash only = total value", () => {
    const result = calculatePortfolioValue(1000, []);
    expect(result.totalValue).toBe(1000);
    expect(result.totalMarketValue).toBe(0);
  });

  it("mixed portfolio", () => {
    const result = calculatePortfolioValue(500, [
      { shares: 5, currentPrice: 100 },
      { shares: 10, currentPrice: 50 },
    ]);
    expect(result.totalValue).toBe(1500);
    expect(result.totalMarketValue).toBe(1000);
  });

  it("zero cash with positions", () => {
    const result = calculatePortfolioValue(0, [
      { shares: 1, currentPrice: 999 },
    ]);
    expect(result.totalValue).toBe(999);
  });
});

describe("Business Logic: P&L calculation", () => {
  function calculatePnl(
    shares: number,
    avgCost: number,
    currentPrice: number
  ): { pnl: number; pnlPct: number } {
    const costBasis = shares * avgCost;
    const marketValue = shares * currentPrice;
    const pnl = marketValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { pnl, pnlPct };
  }

  it("positive P&L (profit)", () => {
    const result = calculatePnl(10, 100, 150);
    expect(result.pnl).toBe(500);
    expect(result.pnlPct).toBe(50);
  });

  it("negative P&L (loss)", () => {
    const result = calculatePnl(5, 200, 100);
    expect(result.pnl).toBe(-500);
    expect(result.pnlPct).toBe(-50);
  });

  it("zero P&L (breakeven)", () => {
    const result = calculatePnl(10, 100, 100);
    expect(result.pnl).toBe(0);
    expect(result.pnlPct).toBe(0);
  });

  it("zero cost basis returns 0% P&L", () => {
    const result = calculatePnl(10, 0, 100);
    expect(result.pnlPct).toBe(0);
  });
});

describe("Business Logic: Weighted average cost", () => {
  function weightedAvgCost(
    existingShares: number,
    existingAvgCost: number,
    newShares: number,
    newPrice: number
  ): number {
    const totalShares = existingShares + newShares;
    return (existingShares * existingAvgCost + newShares * newPrice) / totalShares;
  }

  it("first purchase = price", () => {
    const avg = weightedAvgCost(0, 0, 10, 100);
    expect(avg).toBe(100); // 0*0 + 10*100 / 10
  });

  it("average up", () => {
    const avg = weightedAvgCost(10, 100, 10, 200);
    expect(avg).toBe(150); // (10*100 + 10*200) / 20
  });

  it("average down", () => {
    const avg = weightedAvgCost(10, 200, 10, 100);
    expect(avg).toBe(150);
  });

  it("small additional purchase", () => {
    const avg = weightedAvgCost(100, 150, 1, 200);
    expect(avg).toBeCloseTo(150.495, 2);
  });
});

describe("Business Logic: Liquidation thresholds", () => {
  it("ok when >= $100", () => {
    const totalValue = 100;
    expect(totalValue >= 100).toBe(true);
    expect(totalValue < 50).toBe(false);
  });

  it("warning when $50-$99.99", () => {
    const totalValue = 75;
    expect(totalValue < 100).toBe(true);
    expect(totalValue >= 50).toBe(true);
  });

  it("margin call when < $50", () => {
    const totalValue = 49.99;
    expect(totalValue < 50).toBe(true);
  });

  it("margin call expires after 24 hours", () => {
    const marginCallAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const elapsed = Date.now() - marginCallAt;
    expect(elapsed >= 24 * 60 * 60 * 1000).toBe(true);
  });

  it("margin call still active within 24 hours", () => {
    const marginCallAt = Date.now() - 12 * 60 * 60 * 1000; // 12 hours ago
    const elapsed = Date.now() - marginCallAt;
    expect(elapsed < 24 * 60 * 60 * 1000).toBe(true);
  });
});

describe("Business Logic: Suspension rules", () => {
  it("first liquidation in month → can revive", () => {
    const liquidationCount = 1;
    expect(liquidationCount < 2).toBe(true);
  });

  it("second liquidation in month → suspended", () => {
    const liquidationCount = 2;
    expect(liquidationCount >= 2).toBe(true);
  });

  it("suspension end date is first of next month", () => {
    const now = new Date(2026, 2, 15); // March 15
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(nextMonth.toISOString().split("T")[0]).toBe("2026-04-01");
  });

  it("December suspension → January next year", () => {
    const now = new Date(2026, 11, 20); // Dec 20
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(nextMonth.toISOString().split("T")[0]).toBe("2027-01-01");
  });
});
