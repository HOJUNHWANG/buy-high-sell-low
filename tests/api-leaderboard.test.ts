/**
 * QA Tests: Paper Trading Leaderboard
 * Covers ranking, sorting, pagination, my rank, and edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, setMockData, clearMockData } from "./setup";
import type { NextRequest } from "next/server";

// Helper to create a mock NextRequest with query params
function mockRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/paper/leaderboard");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}

describe("Leaderboard", () => {
  beforeEach(() => { clearMockData(); });

  it("returns empty state with correct shape", async () => {
    setMockData("paper_accounts", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.myRank).toBeNull();
    expect(data.totalCount).toBe(0);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it("calculates return % from $1000 starting balance", async () => {
    setMockUser({ id: "u1" });
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 1500 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].returnPct).toBe(50);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[0].positions).toEqual([]);
  });

  it("includes equity (debt subtracted) in total", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 200 }]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 5, avg_cost: 200, side: "long", leverage: 1, borrowed: 0 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].totalValue).toBe(1200);
    expect(data.entries[0].returnPct).toBe(20);
  });

  it("subtracts borrowed amount for leveraged positions", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 0 }]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 10, avg_cost: 200, side: "long", leverage: 2, borrowed: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].totalValue).toBe(1000);
    expect(data.entries[0].returnPct).toBe(0);
    // Effective leverage = marketValue / equity = 2000 / 1000 = 2.0
    expect(data.entries[0].positions[0].leverage).toBe(2);
  });

  it("sorts by return % descending", async () => {
    setMockData("paper_accounts", [
      { user_id: "loser", cash_balance: 500 },
      { user_id: "winner", cash_balance: 3000 },
      { user_id: "mid", cash_balance: 1000 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].userId).toBe("winner");
    expect(data.entries[1].userId).toBe("mid");
    expect(data.entries[2].userId).toBe("loser");
  });

  it("assigns correct ranks", async () => {
    setMockData("paper_accounts", [
      { user_id: "u1", cash_balance: 2000 },
      { user_id: "u2", cash_balance: 1500 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[1].rank).toBe(2);
  });

  it("paginates at 20 per page", async () => {
    const accounts = Array.from({ length: 45 }, (_, i) => ({
      user_id: `u${i}`, cash_balance: 1000 + i * 10,
    }));
    setMockData("paper_accounts", accounts);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");

    const res1 = await mod.GET(mockRequest({ page: "1" }));
    const data1 = await res1.json();
    expect(data1.entries).toHaveLength(20);
    expect(data1.totalCount).toBe(45);
    expect(data1.totalPages).toBe(3);
    expect(data1.page).toBe(1);

    const res2 = await mod.GET(mockRequest({ page: "3" }));
    const data2 = await res2.json();
    expect(data2.entries).toHaveLength(5);
    expect(data2.page).toBe(3);
  });

  it("returns myRank for current user", async () => {
    setMockUser({ id: "target" });
    setMockData("paper_accounts", [
      { user_id: "winner", cash_balance: 5000 },
      { user_id: "target", cash_balance: 2000 },
      { user_id: "loser", cash_balance: 500 },
    ]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.myRank).not.toBeNull();
    expect(data.myRank.userId).toBe("target");
    expect(data.myRank.rank).toBe(2);
  });

  it("handles negative return (loss)", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 300 }]);
    setMockData("paper_positions", []);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].returnPct).toBe(-70);
  });

  it("returns position details with side and effective leverage", async () => {
    setMockData("paper_accounts", [{ user_id: "u1", cash_balance: 500 }]);
    setMockData("paper_positions", [
      { user_id: "u1", ticker: "AAPL", shares: 5, avg_cost: 100, side: "long", leverage: 1, borrowed: 0 },
      { user_id: "u1", ticker: "MSFT", shares: 6, avg_cost: 200, side: "short", leverage: 2, borrowed: 600 },
    ]);
    setMockData("stock_prices", [
      { ticker: "AAPL", price: 100 },
      { ticker: "MSFT", price: 200 },
    ]);
    const mod = await import("@/app/api/paper/leaderboard/route");
    const res = await mod.GET(mockRequest());
    const data = await res.json();
    expect(data.entries[0].positionCount).toBe(2);

    const aapl = data.entries[0].positions.find((p: { ticker: string }) => p.ticker === "AAPL");
    expect(aapl.side).toBe("long");
    expect(aapl.leverage).toBe(1); // no borrowed

    const msft = data.entries[0].positions.find((p: { ticker: string }) => p.ticker === "MSFT");
    expect(msft.side).toBe("short");
    expect(msft.leverage).toBe(2); // 1200 marketValue / 600 equity = 2.0
  });
});
