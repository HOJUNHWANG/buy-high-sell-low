/**
 * QA Tests: AI Summary Unlock
 * Covers unlock flow, daily limits, premium bypass, and edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, setMockData, clearMockData, getInsertCalls } from "./setup";

const USER = { id: "user-unlock", email: "unlock@test.com" };

describe("Unlock Summary: Validation", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  it("rejects unauthenticated request", async () => {
    setMockUser(null);
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON body", async () => {
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing articleId", async () => {
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects non-integer articleId", async () => {
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: "abc" }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects negative articleId", async () => {
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: -1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects zero articleId", async () => {
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 0 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent article", async () => {
    setMockData("summary_unlocks", []);
    setMockData("news_articles", []);
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 999 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 for article without ai_summary", async () => {
    setMockData("summary_unlocks", []);
    setMockData("news_articles", [{ id: 1, ai_summary: null }]);
    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
  });
});

describe("Unlock Summary: Free tier limits", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  it("successfully unlocks article for free user", async () => {
    setMockData("summary_unlocks", []);
    setMockData("news_articles", [{
      id: 1, ai_summary: "Test summary", ai_insight: "Test insight",
      ai_sentiment: "positive", ai_caution: null,
    }]);
    setMockData("user_profiles", [{ user_id: USER.id, tier: "free" }]);

    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("Test summary");
    expect(data.insight).toBe("Test insight");
  });

  it("returns already-unlocked article without consuming quota", async () => {
    setMockData("summary_unlocks", [{ id: 1, user_id: USER.id, article_id: 5 }]);
    setMockData("news_articles", [{
      id: 5, ai_summary: "Cached", ai_insight: "Insight",
      ai_sentiment: "neutral", ai_caution: "Warning",
    }]);

    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 5 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("Cached");
    // Should not have inserted a new unlock record
    const inserts = getInsertCalls().filter(c => c.table === "summary_unlocks");
    expect(inserts).toHaveLength(0);
  });

  it("rejects when daily limit reached (429)", async () => {
    // Mock: no existing unlock for this article, but 3 unlocks today
    setMockData("summary_unlocks", [
      { id: 1, user_id: USER.id, article_id: 10, unlocked_at: new Date().toISOString() },
      { id: 2, user_id: USER.id, article_id: 11, unlocked_at: new Date().toISOString() },
      { id: 3, user_id: USER.id, article_id: 12, unlocked_at: new Date().toISOString() },
    ]);
    setMockData("news_articles", [{
      id: 20, ai_summary: "New article", ai_insight: "i",
      ai_sentiment: "positive", ai_caution: null,
    }]);
    setMockData("user_profiles", [{ user_id: USER.id, tier: "free" }]);

    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 20 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.remaining).toBe(0);
  });
});

describe("Unlock Summary: Premium tier", () => {
  beforeEach(() => { clearMockData(); setMockUser(USER); });

  it("premium user bypasses daily limit", async () => {
    setMockData("summary_unlocks", []);
    setMockData("news_articles", [{
      id: 1, ai_summary: "Premium", ai_insight: "P",
      ai_sentiment: "positive", ai_caution: null,
    }]);
    setMockData("user_profiles", [{ user_id: USER.id, tier: "premium" }]);

    const mod = await import("@/app/api/unlock-summary/route");
    const req = new Request("http://localhost:3000/api/unlock-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: 1 }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("Premium");
  });
});
