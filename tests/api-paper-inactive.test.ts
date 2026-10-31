import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { clearMockData, getInsertCalls, getUpdateCalls, getRpcCalls, setMockData, setMockUser, setMockRpcResult } from "./setup";
describe("Atomic paper API boundary", () => {
  beforeEach(() => { clearMockData(); setMockUser({ id: "verified-owner" }); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-08T15:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  for (const action of ["buy", "short", "sell", "cover"] as const) {
    it(`${action} derives the owner from the session and never directly edits a ledger`, async () => {
      setMockData("stock_prices", [{ ticker: "AAPL", price: 100, fetched_at: "2026-07-08T14:59:00Z" }]);
      setMockRpcResult("execute_paper_action", { data: { ok: true, cashBalance: 900 } });
      const route = await import(`@/app/api/paper/${action}/route`);
      const key="a197c399-7c55-47f3-a7a8-6802337638cc";
      const res=await route.POST(new Request("http://localhost",{method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify({ ticker:"aapl", shares:1, user_id:"attacker-owner",price:1,cash_balance:99999 })}));
      expect(res.status).toBe(200);
      expect(getRpcCalls()[0]).toEqual({name:"execute_paper_action",args:{p_user_id:"verified-owner",p_action:action,p_request_id:key,p_payload:{ticker:"AAPL",shares:1,quote_fetched_at:"2026-07-08T14:59:00Z"}}});
      expect(getInsertCalls()).toHaveLength(0); expect(getUpdateCalls()).toHaveLength(0);
    });
    it(`${action} rejects delayed quotes before requesting a transaction`, async () => {
      setMockData("stock_prices", [{ ticker:"AAPL",price:100,fetched_at:"2026-07-07T15:00:00Z" }]);
      const route=await import(`@/app/api/paper/${action}/route`);
      expect((await route.POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({ticker:"AAPL",shares:1})}))).status).toBe(503);
      expect(getRpcCalls()).toHaveLength(0);
    });
  }
  for (const ticker of ["DELL","NKE","SPY","OEF","DOT-USD","XMR-USD"]) {
    it(`maps inactive ${ticker} rejection from the transaction to 404`,async()=>{
      setMockData("stock_prices",[{ticker,price:100,fetched_at:"2026-07-08T14:59:00Z"}]);
      setMockRpcResult("execute_paper_action",{data:null,error:{code:"P0404",message:"Ticker not found or inactive"}});
      const {POST}=await import("@/app/api/paper/buy/route");
      expect((await POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({ticker,shares:1})}))).status).toBe(404);
    });
  }
  it("does not expose internal database errors",async()=>{
    setMockRpcResult("execute_paper_action",{data:null,error:{code:"XX000",message:"secret connection details"}});
    const {POST}=await import("@/app/api/paper/checkin/route"); const res=await POST();
    expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
