import { describe, expect, it } from "vitest";
import { fictionalCompanies } from "@/data/fictional-market";
import { isFictionalQuoteFresh, parseFictionalOrder, valueFictionalPortfolio } from "@/lib/fictional-paper";

const ticker = fictionalCompanies[0].ticker;
const order = { ticker, side: "buy", unit: "dollars", amount: 100, requestId: "63223a91-c897-4f12-9a04-9283ed1d80b8" };
const now = Date.parse("2026-09-04T00:30:00Z");
const quote = { ticker, price: 120, change_pct: 2, fetched_at: new Date(now).toISOString() };

describe("Fictional orders", () => {
  it("normalizes symbols and strips client identity and prices", () => {
    expect(parseFictionalOrder({ ...order, ticker: ` ${ticker.toLowerCase()} `, userId: "victim", price: 1 })).toEqual(order);
  });
  it.each([
    { ticker: "AAPL" }, { side: "short" }, { unit: "contracts" }, { unit: ["dollars"] }, { unit: "all" },
    { amount: 0 }, { amount: -1 }, { amount: Infinity }, { amount: NaN },
    { amount: "100" }, { amount: 1e13 }, { requestId: "duplicate" },
  ])("rejects unsupported or malformed orders: %j", (change) => {
    expect(parseFictionalOrder({ ...order, ...change })).toBeNull();
  });
  it("accepts an explicit full-position close", () => {
    expect(parseFictionalOrder({ ...order, side: "sell", unit: "all", amount: 0 })).not.toBeNull();
  });
});

describe("Fictional valuation and quote freshness", () => {
  it("values holdings at their quotes and keeps the $1,000 starting baseline", () => {
    const result = valueFictionalPortfolio(500, [{ ticker, shares: 5, avg_cost: 100 }], [quote]);
    expect(result).toMatchObject({ totalValue: 1100, totalPnl: 100, totalPnlPct: 10 });
    expect(result.positions[0]).toMatchObject({ costBasis: 500, marketValue: 600, pnl: 100, pnlPct: 20 });
  });
  it("does not invent a quote or portfolio return when one holding is unpriced", () => {
    expect(valueFictionalPortfolio(500, [{ ticker, shares: 5, avg_cost: 100 }], []))
      .toMatchObject({ totalValue: null, totalPnl: null, positions: [{ currentPrice: null, marketValue: null, pnl: null }] });
    expect(valueFictionalPortfolio(1000, [], [])).toMatchObject({ totalValue: 1000, totalPnl: 0 });
  });
  it("allows 30-minute update gaps but pauses stale, invalid, and future quotes", () => {
    expect(isFictionalQuoteFresh(quote, now + 30 * 60_000)).toBe(true);
    expect(isFictionalQuoteFresh(quote, now + 90 * 60_000 + 1)).toBe(false);
    expect(isFictionalQuoteFresh(quote, now - 60_001)).toBe(false);
    expect(isFictionalQuoteFresh({ ...quote, price: 0 }, now)).toBe(false);
    expect(isFictionalQuoteFresh({ ...quote, fetched_at: "invalid" }, now)).toBe(false);
  });
});
