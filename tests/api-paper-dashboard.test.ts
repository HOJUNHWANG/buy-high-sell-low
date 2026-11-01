import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { setMockUser } from "./setup";
const state = vi.hoisted(() => ({ liquidation: vi.fn(), portfolio: vi.fn(), challenge: vi.fn() }));
vi.mock("@/lib/paper-actions", () => ({ getPaperLiquidation: state.liquidation }));
vi.mock("@/lib/paper-portfolio", () => ({ getPaperPortfolio: state.portfolio }));
vi.mock("@/lib/paper-challenge", () => ({ getPaperChallenge: state.challenge }));
import { GET } from "@/app/api/paper/dashboard/route";

describe("combined paper dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks(); setMockUser({ id: "verified-owner" });
    state.liquidation.mockResolvedValue(NextResponse.json({ status: "active" }));
    state.portfolio.mockImplementation(() => Promise.resolve(NextResponse.json({ cashBalance: 500 })));
    state.challenge.mockImplementation(() => Promise.resolve(NextResponse.json({ picks: [] })));
  });
  it("rejects unauthenticated requests before touching account data", async () => {
    setMockUser(null);
    expect((await GET()).status).toBe(401);
    expect(state.liquidation).not.toHaveBeenCalled(); expect(state.portfolio).not.toHaveBeenCalled();
  });
  it("reads the portfolio after liquidation and uses only the verified owner", async () => {
    let finish!: (response: NextResponse) => void;
    state.liquidation.mockReturnValue(new Promise<NextResponse>(resolve => { finish = resolve; }));
    const request = GET();
    await vi.waitFor(() => expect(state.liquidation).toHaveBeenCalledTimes(1));
    expect(state.portfolio).not.toHaveBeenCalled();
    expect(state.challenge).toHaveBeenCalledTimes(1);
    finish(NextResponse.json({ status: "liquidated" }));
    const response = await request;
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).portfolio.cashBalance).toBe(500);
    expect(state.portfolio.mock.calls[0][0]).toBe("verified-owner");
    expect(state.challenge.mock.calls[0][0]).toBe("verified-owner");
  });
  it("keeps a challenge outage separate from a valid portfolio", async () => {
    state.challenge.mockRejectedValue(new Error("private internal detail"));
    const response = await GET(); const body = await response.json();
    expect(response.status).toBe(200); expect(body.portfolio.cashBalance).toBe(500);
    expect(body.challenge).toBeNull(); expect(body.challengeError).toBe("Unable to load challenge");
  });
});
