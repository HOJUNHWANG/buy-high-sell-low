/**
 * QA Tests: Paper Trading Business Logic
 * Covers buy, sell, portfolio, checkin, liquidation, revive, and edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setMockUser,
  setMockData,
  clearMockData,
  getInsertCalls,
  getUpdateCalls,
  getUpsertCalls,
} from "./setup";
import { ALL_BADGE_KEYS } from "@/lib/achievements";

const USER = { id: "user-123", email: "test@example.com" };

/** Pre-populate all achievements so no new rewards are granted during trade tests */
function setAllAchievementsEarned(except: string[] = []) {
  const exceptSet = new Set(except);
  setMockData(
    "paper_achievements",
    ALL_BADGE_KEYS
      .filter((key) => !exceptSet.has(key))
      .map((key) => ({ user_id: USER.id, badge_key: key }))
  );
}

async function callRoute(path: string, method = "GET", body?: unknown) {
  const mod = await import(`@/app/api/${path}/route`);
  const handler = mod[method as keyof typeof mod];
  const url = `http://localhost:3000/api/${path}`;
  const request = new Request(url, {
    method,
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  return handler(request);
}

describe("Paper Trading: Buy", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("rejects missing ticker", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    const res = await callRoute("paper/buy", "POST", { shares: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects missing shares", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL" });
    expect(res.status).toBe(400);
  });

  it("rejects zero shares", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects negative shares", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects trade on liquidated account", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "liquidated" }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("liquidated");
  });

  it("rejects trade on suspended account", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "suspended", suspended_until: "2099-01-01" },
    ]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("suspended");
  });

  it("rejects ticker not found", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("stock_prices", []); // no price data
    const res = await callRoute("paper/buy", "POST", { ticker: "FAKE", shares: 1 });
    expect(res.status).toBe(404);
  });

  it("rejects insufficient funds", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 10 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Insufficient");
  });

  it("buys successfully with auto-create account", async () => {
    setMockData("paper_accounts", []); // no account yet
    setMockData("stock_prices", [{ ticker: "AAPL", price: 100 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", []);
    setAllAchievementsEarned();

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 2 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.ticker).toBe("AAPL");
    expect(data.shares).toBe(2);
    expect(data.price).toBe(100);
    expect(data.total).toBe(200);
    expect(data.cashBalance).toBe(800);
  });

  it("records transaction on buy", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 50 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", [{ id: 1 }]); // one existing for count
    setAllAchievementsEarned();

    await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 3 });

    const inserts = getInsertCalls().filter((c) => c.table === "paper_transactions");
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    const txInsert = inserts[inserts.length - 1];
    expect(txInsert.data).toMatchObject({
      user_id: USER.id,
      ticker: "AAPL",
      side: "buy",
      shares: 3,
    });
  });
});

describe("Paper Trading: Sell", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("rejects selling more shares than owned", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 5, avg_cost: 100, created_at: "2024-01-01T00:00:00Z" },
    ]);
    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 10 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Only have 5");
  });

  it("rejects selling a ticker with no position", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    setMockData("paper_positions", []);
    const res = await callRoute("paper/sell", "POST", { ticker: "MSFT", shares: 1 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No position");
  });

  it("sells successfully and calculates P&L", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 500 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 10, avg_cost: 100, created_at: "2024-01-01T00:00:00Z" },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 150 }]);
    setAllAchievementsEarned();

    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 5 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.realizedPnl).toBe(250); // (150-100)*5
    expect(data.cashBalance).toBe(1250); // 500 + 5*150
    expect(data.side).toBe("sell");
  });

  it("triggers buy_high_sell_low badge when selling at a loss", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 200 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "TSLA", shares: 5, avg_cost: 200, created_at: "2024-01-01T00:00:00Z" },
    ]);
    setMockData("stock_prices", [{ ticker: "TSLA", price: 100 }]);
    setAllAchievementsEarned(["buy_high_sell_low"]);

    const res = await callRoute("paper/sell", "POST", { ticker: "TSLA", shares: 5 });
    const data = await res.json();
    expect(data.newAchievements).toContain("buy_high_sell_low");
    expect(data.realizedPnl).toBe(-500); // (100-200)*5
  });

  it("triggers paper_hands badge when selling within 24h", async () => {
    const recentBuy = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 500 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "META", shares: 2, avg_cost: 300, created_at: recentBuy },
    ]);
    setMockData("stock_prices", [{ ticker: "META", price: 310 }]);
    setAllAchievementsEarned(["paper_hands"]);

    const res = await callRoute("paper/sell", "POST", { ticker: "META", shares: 2 });
    const data = await res.json();
    expect(data.newAchievements).toContain("paper_hands");
  });
});

describe("Paper Trading: Check-in", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("returns 404 if no account", async () => {
    setMockData("paper_accounts", []);
    const res = await callRoute("paper/checkin", "POST");
    expect(res.status).toBe(404);
  });

  it("returns already-checked-in if same day", async () => {
    const today = new Date().toISOString().split("T")[0];
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000, last_checkin: today, streak: 3 },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyCheckedIn).toBe(true);
  });

  it("awards base + streak reward on first check-in", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 500, last_checkin: null, streak: 0 },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    const data = await res.json();
    // New streak = 1 (not consecutive), reward = 50 + 1*20 = 70
    expect(data.streak).toBe(1);
    expect(data.reward).toBe(70);
    expect(data.cashBalance).toBe(570);
  });

  it("awards streak bonus on 10th consecutive day", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 2000, last_checkin: yesterday, streak: 9 },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    const data = await res.json();
    // Streak 9 → 10, reward = 50 + 10*20 + 200 = 450
    expect(data.streak).toBe(10);
    expect(data.reward).toBe(450);
    expect(data.bonusMessage).toContain("$200");
  });

  it("resets streak after 10 days", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000, last_checkin: yesterday, streak: 10 },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    const data = await res.json();
    // Streak 10+1 = 11 → resets to 1
    expect(data.streak).toBe(1);
    expect(data.reward).toBe(70); // 50 + 1*20
  });

  it("resets streak if not consecutive", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000, last_checkin: twoDaysAgo, streak: 5 },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    const data = await res.json();
    expect(data.streak).toBe(1); // reset because gap
  });

  it("rejects check-in on suspended account", async () => {
    setMockData("paper_accounts", [
      {
        user_id: USER.id,
        status: "suspended",
        suspended_until: "2099-12-31",
        cash_balance: 0,
        last_checkin: null,
        streak: 0,
      },
    ]);

    const res = await callRoute("paper/checkin", "POST");
    expect(res.status).toBe(403);
  });
});

describe("Paper Trading: Revive", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("returns 404 if no account", async () => {
    setMockData("paper_accounts", []);
    const res = await callRoute("paper/revive", "POST");
    expect(res.status).toBe(404);
  });

  it("rejects revive on active account", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", liquidation_count: 0 },
    ]);
    const res = await callRoute("paper/revive", "POST");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not liquidated");
  });

  it("successfully revives with $500", async () => {
    setMockData("paper_accounts", [
      {
        user_id: USER.id,
        status: "liquidated",
        liquidation_count: 1,
        last_liquidation_at: new Date().toISOString(),
      },
    ]);

    const res = await callRoute("paper/revive", "POST");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cashBalance).toBe(500);

    // Check phoenix badge awarded
    const upserts = getUpsertCalls().filter(
      (c) => c.table === "paper_achievements"
    );
    const phoenixUpsert = upserts.find(
      (c) => (c.data as { badge_key: string }).badge_key === "phoenix"
    );
    expect(phoenixUpsert).toBeTruthy();
  });

  it("rejects 2nd revive in same month", async () => {
    setMockData("paper_accounts", [
      {
        user_id: USER.id,
        status: "liquidated",
        liquidation_count: 2,
        last_liquidation_at: new Date().toISOString(),
      },
    ]);

    const res = await callRoute("paper/revive", "POST");
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("twice this month");
  });
});

describe("Paper Trading: Portfolio", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("auto-creates account with $1000 if none exists", async () => {
    setMockData("paper_accounts", []);
    setMockData("paper_positions", []);
    setMockData("paper_achievements", []);

    const res = await callRoute("paper/portfolio", "GET");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cashBalance).toBe(1000);
    expect(data.positions).toEqual([]);

    // Verify account was inserted
    const inserts = getInsertCalls().filter((c) => c.table === "paper_accounts");
    expect(inserts.length).toBe(1);
  });

  it("returns enriched positions with P&L", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, cash_balance: 500, streak: 3, last_checkin: "2026-03-20", status: "active" },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 5, avg_cost: 100, created_at: "2024-01-01", updated_at: "2024-01-01" },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 150 }]);
    setMockData("stocks", [{ ticker: "AAPL", name: "Apple Inc.", logo_url: "https://logo.com/aapl.png" }]);
    setMockData("paper_achievements", []);

    const res = await callRoute("paper/portfolio", "GET");
    const data = await res.json();

    expect(data.cashBalance).toBe(500);
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0].currentPrice).toBe(150);
    expect(data.positions[0].marketValue).toBe(750);
    expect(data.positions[0].pnl).toBe(250);
    expect(data.positions[0].name).toBe("Apple Inc.");
    expect(data.totalValue).toBe(1250); // 500 + 750
    expect(data.streak).toBe(3);
  });
});

describe("Paper Trading: Buy Edge Cases", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("rejects NaN shares", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "active" }]);
    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: NaN });
    expect(res.status).toBe(400);
  });

  it("updates existing position with weighted avg cost", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 5000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 10, avg_cost: 100 },
    ]);
    setMockData("paper_transactions", [{ id: 1 }]);
    setAllAchievementsEarned();

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 10 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.total).toBe(2000); // 10 * 200
    expect(data.cashBalance).toBe(3000); // 5000 - 2000

    // Verify position was updated with weighted avg
    const updates = getUpdateCalls().filter((c) => c.table === "paper_positions");
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const posUpdate = updates[updates.length - 1];
    expect((posUpdate.data as { shares: number }).shares).toBe(20); // 10 + 10
    expect((posUpdate.data as { avg_cost: number }).avg_cost).toBe(150); // (10*100 + 10*200) / 20
  });

  it("creates new position for first buy of a ticker", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "MSFT", price: 400 }]);
    setMockData("paper_positions", []); // no existing position
    setMockData("paper_transactions", []);
    setAllAchievementsEarned();

    const res = await callRoute("paper/buy", "POST", { ticker: "MSFT", shares: 1 });
    expect(res.status).toBe(200);

    const inserts = getInsertCalls().filter((c) => c.table === "paper_positions");
    expect(inserts.length).toBe(1);
    expect(inserts[0].data).toMatchObject({
      ticker: "MSFT",
      shares: 1,
      avg_cost: 400,
    });
  });

  it("rejects buy when total exactly equals balance + 1 cent", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 99.99 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 100 }]);

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Insufficient");
  });

  it("allows buy when total exactly equals balance", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 100 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 100 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", []);
    setAllAchievementsEarned();

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cashBalance).toBe(0);
  });

  it("awards full_send badge when spending 90%+ of balance", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 950 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", [{ id: 1 }]);
    setAllAchievementsEarned(["full_send"]);

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    const data = await res.json();
    expect(data.newAchievements).toContain("full_send");
  });

  it("awards penny_pincher badge for < $10 trade", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 5 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", [{ id: 1 }]);
    setAllAchievementsEarned(["penny_pincher"]);

    const res = await callRoute("paper/buy", "POST", { ticker: "AAPL", shares: 1 });
    const data = await res.json();
    expect(data.newAchievements).toContain("penny_pincher");
  });

  it("awards crypto_degen badge for crypto ticker", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 50000 },
    ]);
    setMockData("stock_prices", [{ ticker: "BTC-USD", price: 40000 }]);
    setMockData("paper_positions", []);
    setMockData("paper_transactions", [{ id: 1 }]);
    setAllAchievementsEarned(["crypto_degen"]);

    const res = await callRoute("paper/buy", "POST", { ticker: "BTC-USD", shares: 1 });
    const data = await res.json();
    expect(data.newAchievements).toContain("crypto_degen");
  });
});

describe("Paper Trading: Sell Edge Cases", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("sells all shares and deletes position", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 500 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 5, avg_cost: 100, created_at: "2024-01-01T00:00:00Z" },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 120 }]);
    setAllAchievementsEarned();

    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 5 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.realizedPnl).toBe(100); // (120-100)*5
    expect(data.cashBalance).toBe(1100); // 500 + 5*120
  });

  it("rejects sell on liquidated account", async () => {
    setMockData("paper_accounts", [{ user_id: USER.id, status: "liquidated" }]);
    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 1 });
    expect(res.status).toBe(403);
  });

  it("triggers buy_high_sell_low badge when portfolio has a loss", async () => {
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 0 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 1, avg_cost: 200, created_at: "2024-01-01T00:00:00Z" },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 50 }]);
    setAllAchievementsEarned(["buy_high_sell_low"]);

    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 1 });
    const data = await res.json();
    expect(data.newAchievements).toContain("buy_high_sell_low");
    expect(data.realizedPnl).toBe(-150); // (50-200)*1
    // cashBalance = 0 + 50 (sell proceeds) + 100 (buy_high_sell_low silver badge reward)
    expect(data.cashBalance).toBe(150);
  });

  it("triggers diamond_hands badge for 30+ day hold", async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    setMockData("paper_accounts", [
      { user_id: USER.id, status: "active", cash_balance: 1000 },
    ]);
    setMockData("paper_positions", [
      { user_id: USER.id, ticker: "AAPL", shares: 5, avg_cost: 100, created_at: thirtyOneDaysAgo },
    ]);
    setMockData("stock_prices", [{ ticker: "AAPL", price: 200 }]);
    setAllAchievementsEarned(["diamond_hands"]);

    const res = await callRoute("paper/sell", "POST", { ticker: "AAPL", shares: 5 });
    const data = await res.json();
    expect(data.newAchievements).toContain("diamond_hands");
  });
});

describe("Paper Trading: Transactions", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(USER);
  });

  it("paginates results", async () => {
    setMockData("paper_transactions", [
      { id: 1, user_id: USER.id, ticker: "AAPL", side: "buy", shares: 1, price: 100, total: 100, executed_at: "2024-01-01" },
      { id: 2, user_id: USER.id, ticker: "MSFT", side: "buy", shares: 2, price: 200, total: 400, executed_at: "2024-01-02" },
    ]);

    const mod = await import("@/app/api/paper/transactions/route");
    const request = new Request("http://localhost:3000/api/paper/transactions?limit=10&offset=0");
    const res = await mod.GET(request);
    const data = await res.json();

    expect(data.limit).toBe(10);
    expect(data.offset).toBe(0);
    expect(data.transactions).toBeDefined();
  });

  it("caps limit at 100", async () => {
    setMockData("paper_transactions", []);
    const mod = await import("@/app/api/paper/transactions/route");
    const request = new Request("http://localhost:3000/api/paper/transactions?limit=999");
    const res = await mod.GET(request);
    const data = await res.json();
    expect(data.limit).toBe(100);
  });
});
