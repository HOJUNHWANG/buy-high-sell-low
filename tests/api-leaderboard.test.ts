/**
 * QA Tests: Paper Trading Leaderboard
 * Covers ranking, sorting, caching, and edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockData, clearMockData } from "./setup";

describe("Leaderboard", () => {
  beforeEach(() => { clearMockData(); });

  it("returns empty array when no accounts", async () => {
    setMockData("paper_accounts", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("calculates return % from $1000 starting balance", async () => {
    setMockData("paper_accounts", [
      { user_id: "u1", cash_balance: 1500 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].returnPct).toBe(50); // (1500-1000)/1000*100
    expect(data[0].rank).toBe(1);
    expect(data[0].positions).toEqual([]);
  });

  it("includes equity (not raw market value) in total", async () => {
    setMockData("paper_accounts", [
      { user_id: "u1", cash_balance: 200 },
    ]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 5, avg_cost: 200, side: "long", leverage: 1, borrowed: 0 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data[0].totalValue).toBe(1200); // 200 + (5*200 - 0)
    expect(data[0].returnPct).toBe(20);
    expect(data[0].positions).toHaveLength(1);
    expect(data[0].positions[0].ticker).toBe("AAPL");
    expect(data[0].positions[0].side).toBe("long");
  });

  it("subtracts borrowed amount for leveraged positions", async () => {
    setMockData("paper_accounts", [
      { user_id: "u1", cash_balance: 0 },
    ]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 10, avg_cost: 200, side: "long", leverage: 2, borrowed: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    // equity = marketValue - borrowed = 2000 - 1000 = 1000
    // totalValue = 0 (cash) + 1000 (equity) = 1000
    expect(data[0].totalValue).toBe(1000);
    expect(data[0].returnPct).toBe(0);
    expect(data[0].positions[0].leverage).toBe(2);
  });

  it("sorts by return % descending", async () => {
    setMockData("paper_accounts", [
      { user_id: "loser", cash_balance: 500 },
      { user_id: "winner", cash_balance: 3000 },
      { user_id: "mid", cash_balance: 1000 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data[0].userId).toBe("winner");
    expect(data[1].userId).toBe("mid");
    expect(data[2].userId).toBe("loser");
  });

  it("assigns correct ranks", async () => {
    setMockData("paper_accounts", [
      { user_id: "u1", cash_balance: 2000 },
      { user_id: "u2", cash_balance: 1500 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data[0].rank).toBe(1);
    expect(data[1].rank).toBe(2);
  });

  it("limits to top 50", async () => {
    const accounts = Array.from({ length: 60 }, (_, i) => ({
      user_id: `u${i}`, cash_balance: 1000 + i * 10,
    }));
    setMockData("paper_accounts", accounts);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data).toHaveLength(50);
  });

  it("handles negative return (loss)", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 300 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data[0].returnPct).toBe(-70); // (300-1000)/1000*100
  });

  it("returns valid response for empty leaderboard", async () => {
    setMockData("paper_accounts", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("counts positions per user and returns position details", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 500 }]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 5, avg_cost: 100, side: "long", leverage: 1, borrowed: 0 },
      { user_id: "u1", ticker: "MSFT", shares: 3, avg_cost: 200, side: "short", leverage: 2, borrowed: 300 },
    ]);
    setMockData("stock_prices", [
      { ticker: "AAPL", price: 100 },
      { ticker: "MSFT", price: 200 },
    ]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data[0].positionCount).toBe(2);
    expect(data[0].positions).toHaveLength(2);

    const aapl = data[0].positions.find((p: { ticker: string }) => p.ticker === "AAPL");
    expect(aapl.side).toBe("long");
    expect(aapl.leverage).toBe(1);

    const msft = data[0].positions.find((p: { ticker: string }) => p.ticker === "MSFT");
    expect(msft.side).toBe("short");
    expect(msft.leverage).toBe(2);
  });
});
