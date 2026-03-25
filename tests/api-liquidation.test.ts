import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, setMockData, clearMockData, getUpdateCalls, getInsertCalls, getUpsertCalls } from "./setup";

const USER = { id: "user-liq", email: "liq@test.com" };

describe("Liquidation: Status checks", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  it("returns no_account when no paper account", async () => {
    setMockData("paper_accounts", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("no_account");
  });

  it("returns ok when portfolio >= $100", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 500, status: "active", liquidation_count: 0 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.totalValue).toBe(500);
  });

  it("returns warning when $50-$99.99", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 75, status: "active", liquidation_count: 0 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("warning");
    expect(data.totalValue).toBe(75);
  });

  it("starts margin call when < $50", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 30, status: "active", liquidation_count: 0 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("margin_call");
    expect(data.hoursLeft).toBe(24);
  });

  it("returns margin call hours remaining when within 24h", async () => {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 30, status: "margin_call", margin_call_at: twelveHoursAgo, liquidation_count: 0 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("margin_call");
    expect(data.hoursLeft).toBeGreaterThan(11);
    expect(data.hoursLeft).toBeLessThan(13);
  });

  it("force liquidates after 24h margin call", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 10, status: "margin_call", margin_call_at: twentyFiveHoursAgo, liquidation_count: 0, last_liquidation_at: null }]);
    setMockData("paper_positions", [{ user_id: USER.id, ticker: "AAPL", shares: 1, side: "long", avg_cost: 20, borrowed: 0 }]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 20 }]);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("suspended");
    expect(data.suspendedUntil).toBeTruthy();
  });

  it("suspends on 2nd liquidation same month", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 10, status: "margin_call", margin_call_at: twentyFiveHoursAgo, liquidation_count: 1, last_liquidation_at: new Date().toISOString() }]);
    setMockData("paper_positions", []);
    setMockData("stock_prices", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("suspended");
    expect(data.suspendedUntil).toBeTruthy();
  });

  it("clears margin call when portfolio recovers above $50", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 60, status: "margin_call", margin_call_at: new Date().toISOString(), liquidation_count: 0 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    // Should not still be margin_call — route clears it
    const data = await res.json();
    // The route returns warning (60 < 100) after clearing margin_call
    expect(data.status).toBe("warning");
  });

  it("returns suspended status with date", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "suspended", suspended_until: "2099-01-01", cash_balance: 0, liquidation_count: 2 }]);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("suspended");
    expect(data.suspendedUntil).toBe("2099-01-01");
  });

  it("auto-restarts suspended account when date passes", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "suspended", suspended_until: "2020-01-01", cash_balance: 0, liquidation_count: 2 }]);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("restarted");
    expect(data.cashBalance).toBe(1000);
  });

  it("returns suspended status for liquidated account", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "liquidated", liquidation_count: 1, last_liquidation_at: new Date().toISOString(), cash_balance: 0 }]);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("suspended");
  });

  it("includes position value in portfolio total", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 20, status: "active", liquidation_count: 0 }]);
    setMockData("paper_positions", [{ user_id: USER.id, ticker: "AAPL", shares: 1, side: "long", avg_cost: 200, borrowed: 0 }]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const mod = await import("@/app/api/paper/liquidation/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.totalValue).toBe(220);
  });

  it("awards liquidated badge on force liquidation", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 10, status: "margin_call", margin_call_at: twentyFiveHoursAgo, liquidation_count: 0, last_liquidation_at: null }]);
    setMockData("paper_positions", []);
    setMockData("stock_prices", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    await mod.GET();
    const upserts = getUpsertCalls().filter(c => c.table === "paper_achievements");
    const liqBadge = upserts.find(c => (c.data as { badge_key: string }).badge_key === "liquidated");
    expect(liqBadge).toBeTruthy();
  });

  it("awards cockroach badge on 3rd liquidation", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [{ user_id: USER.id, cash_balance: 10, status: "margin_call", margin_call_at: twentyFiveHoursAgo, liquidation_count: 2, last_liquidation_at: "2020-01-01T00:00:00Z" }]);
    setMockData("paper_positions", []);
    setMockData("stock_prices", []);
    const mod = await import("@/app/api/paper/liquidation/route");
    await mod.GET();
    const upserts = getUpsertCalls().filter(c => c.table === "paper_achievements");
    const cockroach = upserts.find(c => (c.data as { badge_key: string }).badge_key === "cockroach");
    expect(cockroach).toBeTruthy();
  });
});
