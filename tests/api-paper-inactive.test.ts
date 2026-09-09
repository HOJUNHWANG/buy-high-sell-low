import { beforeEach, describe, expect, it } from "vitest";
import { clearMockData, getInsertCalls, getUpdateCalls, setMockData, setMockUser } from "./setup";

describe("Paper trading during index changes", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser({ id: "index-test" });
  });

  it("excludes pending and retired stocks from new weekly challenges", async () => {
    const active = ["AAPL", "MSFT", "AMZN", "NVDA", "GOOG"];
    setMockData("stock_prices", [
      ...active.map((ticker) => ({ ticker, price: 100, "stocks.is_active": true })),
      ...["DELL", "NKE"].map((ticker) => ({ ticker, price: 100, "stocks.is_active": false })),
    ]);
    const { GET } = await import("@/app/api/paper/challenge/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const inserted = getInsertCalls().find((call) => call.table === "paper_challenges");
    const picks = (inserted?.data as { picks: { ticker: string }[] }).picks;
    expect(picks.map((pick) => pick.ticker).sort()).toEqual(active.sort());
  });

  for (const action of ["buy", "short"] as const) {
    it(`allows active ${action} to reach the margin check`, async () => {
      setMockData("paper_accounts", [{ user_id: "index-test", cash_balance: 1000, status: "active" }]);
      setMockData("stock_prices", [{ ticker: "DELL", price: 100, "stocks.is_active": true }]);
      const { POST } = action === "buy"
        ? await import("@/app/api/paper/buy/route")
        : await import("@/app/api/paper/short/route");
      const response = await POST(new Request(`http://localhost/api/paper/${action}`, {
        method: "POST", body: JSON.stringify({ ticker: "DELL", shares: 100 }),
      }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Insufficient margin/);
      expect(getInsertCalls()).toHaveLength(0);
      expect(getUpdateCalls()).toHaveLength(0);
    });
    for (const ticker of ["DELL", "NKE"]) {
      it(`rejects ${action} for inactive ${ticker} even when a price exists`, async () => {
        setMockData("stock_prices", [{ ticker, price: 100, "stocks.is_active": false }]);
        const { POST } = action === "buy"
          ? await import("@/app/api/paper/buy/route")
          : await import("@/app/api/paper/short/route");
        const response = await POST(new Request(`http://localhost/api/paper/${action}`, {
          method: "POST", body: JSON.stringify({ ticker, shares: 1 }),
        }));
        expect(response.status).toBe(404);
        expect(getInsertCalls()).toHaveLength(0);
        expect(getUpdateCalls()).toHaveLength(0);
      });
    }
  }
});
