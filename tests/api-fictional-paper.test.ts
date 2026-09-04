import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockData, setMockData, setMockRpcResult, setMockUser } from "./setup";
import { fictionalCompanies } from "@/data/fictional-market";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { GET as portfolio } from "@/app/api/fictional-paper/portfolio/route";
import { POST as trade } from "@/app/api/fictional-paper/trade/route";
import { GET as history } from "@/app/api/fictional-paper/transactions/route";
import { GET as rankings } from "@/app/api/fictional-paper/leaderboard/route";

const ticker = fictionalCompanies[0].ticker;
const user = { id: "648f008c-b08b-40d9-8126-f988f0b4c38b" };
const order = { ticker, side: "buy", unit: "dollars", amount: 100, requestId: "63223a91-c897-4f12-9a04-9283ed1d80b8" };
const request = (body: unknown = order, origin = "https://bhsl.test") => new Request("https://bhsl.test/api/fictional-paper/trade", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
});

beforeEach(() => { clearMockData(); setMockUser(user); vi.clearAllMocks(); });

describe("Fictional paper API", () => {
  it("requires authentication for balances, trades and private history", async () => {
    setMockUser(null);
    expect((await portfolio()).status).toBe(401);
    expect((await trade(request())).status).toBe(401);
    expect((await history(new Request("https://bhsl.test/api/fictional-paper/transactions"))).status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("starts independently from the existing real-market cash and positions", async () => {
    setMockData("paper_accounts", [{ user_id: user.id, cash_balance: 99000 }]);
    setMockData("paper_positions", [{ user_id: user.id, ticker: "AAPL", shares: 20, avg_cost: 200 }]);
    setMockData("fictional_paper_accounts", [{ user_id: "another-user", cash_balance: 9000 }]);
    const response = await portfolio();
    expect(await response.json()).toMatchObject({ cashBalance: 1000, totalValue: 1000, positions: [] });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("filters positions to the authenticated owner and values only Fictional prices", async () => {
    setMockData("fictional_paper_accounts", [{ user_id: user.id, cash_balance: 500 }]);
    setMockData("fictional_paper_positions", [
      { user_id: user.id, ticker, shares: 5, avg_cost: 100 },
      { user_id: "another-user", ticker, shares: 50, avg_cost: 100 },
    ]);
    setMockData("fictional_prices", [{ ticker, price: 120, change_pct: 0, fetched_at: new Date().toISOString() }]);
    const body = await (await portfolio()).json();
    expect(body.totalValue).toBe(1100);
    expect(body.positions).toHaveLength(1);
  });
  it("passes verified identity and an idempotency key, ignoring a forged fill price", async () => {
    setMockRpcResult("execute_fictional_paper_trade", { data: { id: 17, price: 120 } });
    const response = await trade(request({ ...order, userId: "victim", price: 0.01 }));
    const admin = vi.mocked(createSupabaseAdmin).mock.results[0].value;
    expect(admin.rpc).toHaveBeenCalledWith("execute_fictional_paper_trade", {
      p_user_id: user.id, p_ticker: ticker, p_side: "buy", p_unit: "dollars", p_amount: 100, p_request_id: order.requestId,
    });
    expect(await response.json()).toEqual({ ok: true, trade: { id: 17, price: 120 } });
  });
  it("rejects cross-origin requests and real symbols before opening an admin client", async () => {
    expect((await trade(request(order, "https://malicious.test"))).status).toBe(403);
    expect((await trade(request({ ...order, ticker: "AAPL" }))).status).toBe(400);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it.each([["PT400", 400], ["PT404", 404], ["PT409", 409], ["PT503", 503]])("preserves business rejection %s", async (code, status) => {
    setMockRpcResult("execute_fictional_paper_trade", { data: null, error: { code: String(code), message: "Rejected order" } });
    const response = await trade(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Rejected order", code });
  });
  it("sanitizes unexpected database failures and asks for the same-order retry", async () => {
    setMockRpcResult("execute_fictional_paper_trade", { data: null, error: { code: "XX000", message: "private database detail" } });
    const response = await trade(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Trade could not be confirmed. Retry the same order.");
  });
  it("paginates the user's own history beyond the first 20 records", async () => {
    setMockData("fictional_paper_transactions", [
      { id: 100, user_id: "another-user" },
      ...Array.from({ length: 23 }, (_, id) => ({ id, user_id: user.id, ticker })),
    ]);
    const first = await (await history(new Request("https://bhsl.test/api/fictional-paper/transactions"))).json();
    const second = await (await history(new Request("https://bhsl.test/api/fictional-paper/transactions?page=2"))).json();
    expect(first.transactions).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.transactions.map((row: { id: number }) => row.id)).toEqual([20, 21, 22]);
    expect(second.hasMore).toBe(false);
  });
  it("uses only the separate aggregate ranking RPC for the current viewer", async () => {
    setMockRpcResult("fictional_paper_leaderboard", { data: { entries: [], myRank: null, totalCount: 0 } });
    expect((await rankings()).status).toBe(200);
    expect(vi.mocked(createSupabaseAdmin).mock.results[0].value.rpc)
      .toHaveBeenCalledWith("fictional_paper_leaderboard", { p_viewer: user.id });
  });
});
