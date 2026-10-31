import { describe, it, expect } from "vitest";
import { safeAuthNext, loginHref } from "@/lib/auth-redirect";
describe("authentication return path", () => {
  it("preserves ticker and order context", () => {
    expect(safeAuthNext("/paper/trade/AAPL?side=short#order")).toBe("/paper/trade/AAPL?side=short#order");
    expect(loginHref("/stock/MSFT")).toContain("next=%2Fstock%2FMSFT");
  });
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/auth/login?next=//evil.test"]) {
    it(`rejects unsafe return ${JSON.stringify(value)}`, () => expect(safeAuthNext(value)).toBe("/"));
  }
});
