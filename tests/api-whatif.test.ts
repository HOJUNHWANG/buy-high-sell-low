/**
 * QA Tests: What If Calculator
 * Covers calculation, validation, save/delete, and edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, setMockData, clearMockData } from "./setup";

const USER = { id: "user-456", email: "whatif@test.com" };

describe("What If: Input Validation", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("rejects missing ticker", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyDate: "2020-01-01", amount: 1000 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing buyDate", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "AAPL", amount: 1000 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects zero amount", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "AAPL", buyDate: "2020-01-01", amount: 0 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects negative amount", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "AAPL", buyDate: "2020-01-01", amount: -500 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });
});

describe("What If: Calculation", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("calculates P&L for still-holding scenario", async () => {
    setMockData("price_history_long", [
      { ticker: "AAPL", date: "2020-01-02", close: 100 },
      { ticker: "AAPL", date: "2020-06-01", close: 130 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);

    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "AAPL", buyDate: "2020-01-01", amount: 1000 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ticker).toBe("AAPL");
    expect(data.stillHolding).toBe(true);
    expect(data.buyPrice).toBe(100);
    expect(data.sellPrice).toBe(200);
    expect(data.shares).toBe(10); // 1000 / 100
    expect(data.currentValue).toBe(2000);
    expect(data.pnl).toBe(1000);
    expect(data.pnlPct).toBe(100);
  });

  it("returns 404 when no buy date price available", async () => {
    setMockData("price_history_long", []);

    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: "FAKE", buyDate: "1990-01-01", amount: 500 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
  });
});

describe("What If: Saved Scenarios", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("returns empty array when no saved scenarios", async () => {
    setMockData("whatif_scenarios", []);
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif");
    const res = await mod.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("deletes scenario by id (requires user_id match)", async () => {
    setMockData("whatif_scenarios", [{ id: 42, user_id: USER.id }]);

    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif?id=42", { method: "DELETE" });
    const res = await mod.DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("rejects delete without id", async () => {
    const mod = await import("@/app/api/whatif/route");
    const req = new Request("http://localhost:3000/api/whatif", { method: "DELETE" });
    const res = await mod.DELETE(req);
    expect(res.status).toBe(400);
  });
});

describe("What If: Date Range API", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("returns min and max dates for a ticker", async () => {
    // Mock single() returns first matching item; both queries hit same data.
    // With a single-item dataset, min and max are the same — tests the happy path.
    setMockData("price_history_long", [
      { ticker: "AAPL", date: "2006-01-03" },
    ]);

    const mod = await import("@/app/api/whatif/date-range/route");
    const req = new Request("http://localhost:3000/api/whatif/date-range?ticker=AAPL");
    const res = await mod.GET(req as Request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.minDate).toBeDefined();
    expect(data.maxDate).toBeDefined();
    expect(typeof data.minDate).toBe("string");
    expect(typeof data.maxDate).toBe("string");
  });

  it("returns 404 for ticker with no data", async () => {
    setMockData("price_history_long", []);

    const mod = await import("@/app/api/whatif/date-range/route");
    const req = new Request("http://localhost:3000/api/whatif/date-range?ticker=FAKE");
    const res = await mod.GET(req as Request);
    expect(res.status).toBe(404);
  });

  it("rejects missing ticker param", async () => {
    const mod = await import("@/app/api/whatif/date-range/route");
    const req = new Request("http://localhost:3000/api/whatif/date-range");
    const res = await mod.GET(req as Request);
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request", async () => {
    setMockUser(null);
    const mod = await import("@/app/api/whatif/date-range/route");
    const req = new Request("http://localhost:3000/api/whatif/date-range?ticker=AAPL");
    const res = await mod.GET(req as Request);
    expect(res.status).toBe(401);
  });
});
