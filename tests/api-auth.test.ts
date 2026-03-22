/**
 * QA Tests: Authentication & Authorization
 * Tests that all protected routes properly reject unauthenticated requests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, clearMockData } from "./setup";

// Helper to call route handlers
async function callRoute(path: string, method = "GET", body?: unknown) {
  const mod = await import(`@/app/api/${path}/route`);
  const handler = mod[method === "GET" ? "GET" : method === "POST" ? "POST" : "DELETE"];

  const url = `http://localhost:3000/api/${path}`;
  const request = new Request(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

  return handler(request);
}

describe("Auth: All protected routes reject unauthenticated requests", () => {
  beforeEach(() => {
    clearMockData();
    setMockUser(null);
  });

  const protectedRoutes = [
    { path: "paper/portfolio", method: "GET" },
    { path: "paper/buy", method: "POST", body: { ticker: "AAPL", shares: 1 } },
    { path: "paper/sell", method: "POST", body: { ticker: "AAPL", shares: 1 } },
    { path: "paper/transactions", method: "GET" },
    { path: "paper/checkin", method: "POST" },
    { path: "paper/liquidation", method: "GET" },
    { path: "paper/revive", method: "POST" },
    { path: "paper/roast", method: "POST" },
    { path: "paper/challenge", method: "GET" },
    { path: "whatif", method: "GET" },
    { path: "whatif", method: "POST", body: { ticker: "AAPL", buyDate: "2020-01-01", amount: 1000 } },
    { path: "ai-summary", method: "POST", body: { articleId: 1 } },
  ];

  for (const { path, method, body } of protectedRoutes) {
    it(`${method} /api/${path} → 401 when not authenticated`, async () => {
      const res = await callRoute(path, method, body);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });
  }

  it("GET /api/search does NOT require auth (public route)", async () => {
    const mod = await import("@/app/api/search/route");
    const req = new Request("http://localhost:3000/api/search?q=AAPL");
    const res = await mod.GET(req);
    // Search should return data (empty array), not 401
    expect(res.status).not.toBe(401);
  });
});
