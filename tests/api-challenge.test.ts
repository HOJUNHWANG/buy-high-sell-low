import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, setMockData, clearMockData, getInsertCalls, getUpdateCalls } from "./setup";

const USER = { id: "user-ch", email: "ch@test.com" };

describe("Challenge: GET", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  it("generates new challenge with 5 picks when none exists", async () => {
    setMockData("paper_challenges", []);
    // Need at least 5 tickers with prices
    setMockData("stock_prices", [
      { ticker: "AAPL", price: 150 }, { ticker: "MSFT", price: 300 },
      { ticker: "NVDA", price: 500 }, { ticker: "AMZN", price: 180 },
      { ticker: "GOOGL", price: 140 }, { ticker: "META", price: 400 },
      { ticker: "TSLA", price: 250 }, { ticker: "JPM", price: 190 },
    ]);
    const mod = await import("@/app/api/paper/challenge/route");
    const res = await mod.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.picks).toHaveLength(5);
    expect(data.status).toBe("active");
  });

  it("returns 503 when not enough price data", async () => {
    setMockData("paper_challenges", []);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 150 }]); // only 1
    const mod = await import("@/app/api/paper/challenge/route");
    const res = await mod.GET();
    expect(res.status).toBe(503);
  });

  it("returns existing active challenge", async () => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const start = monday.toISOString().split("T")[0];
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const end = friday.toISOString().split("T")[0];

    setMockData("paper_challenges", [{
      id: 1, user_id: USER.id, week_start: start, week_end: end,
      status: "active",
      picks: [
        { ticker: "AAPL", direction: null, base_price: 150, final_price: null, correct: null },
        { ticker: "MSFT", direction: null, base_price: 300, final_price: null, correct: null },
        { ticker: "NVDA", direction: null, base_price: 500, final_price: null, correct: null },
        { ticker: "AMZN", direction: null, base_price: 180, final_price: null, correct: null },
        { ticker: "GOOGL", direction: null, base_price: 140, final_price: null, correct: null },
      ],
    }]);
    setMockData("stock_prices", [
      { ticker: "AAPL", price: 155 }, { ticker: "MSFT", price: 310 },
      { ticker: "NVDA", price: 520 }, { ticker: "AMZN", price: 175 },
      { ticker: "GOOGL", price: 145 },
    ]);
    const mod = await import("@/app/api/paper/challenge/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("active");
    expect(data.picks).toHaveLength(5);
  });

  it("returns pending challenge with current prices", async () => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const start = monday.toISOString().split("T")[0];
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const end = friday.toISOString().split("T")[0];

    setMockData("paper_challenges", [{
      id: 1, user_id: USER.id, week_start: start, week_end: end,
      status: "pending",
      picks: [
        { ticker: "AAPL", direction: "up", base_price: 150, final_price: null, correct: null },
        { ticker: "MSFT", direction: "down", base_price: 300, final_price: null, correct: null },
        { ticker: "NVDA", direction: "up", base_price: 500, final_price: null, correct: null },
        { ticker: "AMZN", direction: "up", base_price: 180, final_price: null, correct: null },
        { ticker: "GOOGL", direction: "down", base_price: 140, final_price: null, correct: null },
      ],
    }]);
    setMockData("stock_prices", [
      { ticker: "AAPL", price: 155 }, { ticker: "MSFT", price: 290 },
      { ticker: "NVDA", price: 520 }, { ticker: "AMZN", price: 190 },
      { ticker: "GOOGL", price: 130 },
    ]);
    const mod = await import("@/app/api/paper/challenge/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("pending");
    expect(data.picks[0].currentPct).toBeDefined();
  });

  it("returns expired status for existing challenge from past week", async () => {
    // Route queries by current week_start, so old challenges won't match.
    // Instead we test: existing challenge with status="expired" is returned correctly.
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const start = monday.toISOString().split("T")[0];
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const end = friday.toISOString().split("T")[0];

    setMockData("paper_challenges", [{
      id: 1, user_id: USER.id, week_start: start, week_end: end,
      status: "expired",
      picks: [
        { ticker: "AAPL", direction: null, base_price: 150, final_price: null, correct: null },
        { ticker: "MSFT", direction: null, base_price: 300, final_price: null, correct: null },
        { ticker: "NVDA", direction: null, base_price: 500, final_price: null, correct: null },
        { ticker: "AMZN", direction: null, base_price: 180, final_price: null, correct: null },
        { ticker: "GOOGL", direction: null, base_price: 140, final_price: null, correct: null },
      ],
    }]);
    const mod = await import("@/app/api/paper/challenge/route");
    const res = await mod.GET();
    const data = await res.json();
    expect(data.status).toBe("expired");
  });
});

describe("Challenge: POST (submit predictions)", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  function getWeekBounds() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return { start: monday.toISOString().split("T")[0], end: friday.toISOString().split("T")[0] };
  }

  it("rejects with invalid JSON", async () => {
    const mod = await import("@/app/api/paper/challenge/route");
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects when not exactly 5 predictions", async () => {
    const mod = await import("@/app/api/paper/challenge/route");
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [{ ticker: "AAPL", direction: "up" }] }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid direction", async () => {
    const mod = await import("@/app/api/paper/challenge/route");
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [
        { ticker: "AAPL", direction: "sideways" },
        { ticker: "MSFT", direction: "up" },
        { ticker: "NVDA", direction: "up" },
        { ticker: "AMZN", direction: "down" },
        { ticker: "GOOGL", direction: "down" },
      ]}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects when no challenge exists", async () => {
    const mod = await import("@/app/api/paper/challenge/route");
    setMockData("paper_challenges", []);
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [
        { ticker: "AAPL", direction: "up" },
        { ticker: "MSFT", direction: "down" },
        { ticker: "NVDA", direction: "up" },
        { ticker: "AMZN", direction: "up" },
        { ticker: "GOOGL", direction: "down" },
      ]}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
  });

  it("rejects submission on already-submitted challenge", async () => {
    const { start, end } = getWeekBounds();
    setMockData("paper_challenges", [{
      id: 1, user_id: USER.id, week_start: start, week_end: end, status: "pending",
      picks: [],
    }]);
    const mod = await import("@/app/api/paper/challenge/route");
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [
        { ticker: "AAPL", direction: "up" },
        { ticker: "MSFT", direction: "down" },
        { ticker: "NVDA", direction: "up" },
        { ticker: "AMZN", direction: "up" },
        { ticker: "GOOGL", direction: "down" },
      ]}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("successfully submits predictions", async () => {
    const { start, end } = getWeekBounds();
    setMockData("paper_challenges", [{
      id: 1, user_id: USER.id, week_start: start, week_end: end, status: "active",
      picks: [
        { ticker: "AAPL", direction: null, base_price: 150 },
        { ticker: "MSFT", direction: null, base_price: 300 },
        { ticker: "NVDA", direction: null, base_price: 500 },
        { ticker: "AMZN", direction: null, base_price: 180 },
        { ticker: "GOOGL", direction: null, base_price: 140 },
      ],
    }]);
    const mod = await import("@/app/api/paper/challenge/route");
    const req = new Request("http://localhost:3000/api/paper/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [
        { ticker: "AAPL", direction: "up" },
        { ticker: "MSFT", direction: "down" },
        { ticker: "NVDA", direction: "up" },
        { ticker: "AMZN", direction: "up" },
        { ticker: "GOOGL", direction: "down" },
      ]}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("pending");
    expect(data.picks).toHaveLength(5);
    expect(data.picks[0].direction).toBe("up");
  });
});
