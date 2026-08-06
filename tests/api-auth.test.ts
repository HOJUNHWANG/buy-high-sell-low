/**
 * QA Tests: Authentication & Authorization
 * Tests that all protected routes properly reject unauthenticated requests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockUser, clearMockData } from "./setup";

const routeLoaders = {
  "paper/portfolio": () => import("@/app/api/paper/portfolio/route"),
  "paper/buy": () => import("@/app/api/paper/buy/route"),
  "paper/sell": () => import("@/app/api/paper/sell/route"),
  "paper/transactions": () => import("@/app/api/paper/transactions/route"),
  "paper/checkin": () => import("@/app/api/paper/checkin/route"),
  "paper/liquidation": () => import("@/app/api/paper/liquidation/route"),
  "paper/short": () => import("@/app/api/paper/short/route"),
  "paper/cover": () => import("@/app/api/paper/cover/route"),
  "paper/roast": () => import("@/app/api/paper/roast/route"),
  "paper/challenge": () => import("@/app/api/paper/challenge/route"),
  "ai-summary": () => import("@/app/api/ai-summary/route"),
  "ai/why-moving": () => import("@/app/api/ai/why-moving/route"),
} as const;

// Helper to call route handlers
async function callRoute(path: string, method = "GET", body?: unknown) {
  const loader = routeLoaders[path as keyof typeof routeLoaders];
  if (!loader) throw new Error(`Missing test route loader for ${path}`);
  const mod = await loader();
  const handler = (
    mod as unknown as Record<
      string,
      (request: Request) => Response | Promise<Response>
    >
  )[method === "GET" ? "GET" : method === "POST" ? "POST" : "DELETE"];
  if (!handler) throw new Error(`Missing ${method} handler for ${path}`);

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
    // paper/revive is deprecated (always 410), no auth check needed
    { path: "paper/short", method: "POST", body: { ticker: "AAPL", shares: 1 } },
    { path: "paper/cover", method: "POST", body: { ticker: "AAPL", shares: 1 } },
    { path: "paper/roast", method: "POST" },
    { path: "paper/challenge", method: "GET" },
    { path: "ai-summary", method: "POST", body: { articleId: 1 } },
    { path: "ai/why-moving", method: "POST", body: { ticker: "AAPL" } },
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
