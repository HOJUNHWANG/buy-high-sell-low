import { beforeEach, describe, expect, it } from "vitest";
import { getNewsAccess } from "@/lib/news-access";
import { clearMockData, setMockData, setMockUser } from "./setup";

describe("request-specific summary access", () => {
  beforeEach(() => { clearMockData(); setMockUser(null); });
  it("keeps guests separate from verified members", async () => {
    expect((await getNewsAccess()).tier).toBe("guest");
    setMockUser({ id: "one" });
    setMockData("user_profiles", [{ user_id: "one", tier: "premium" }]);
    expect((await getNewsAccess()).tier).toBe("premium");
  });
  it("preserves the stored tier and each user's unlock records", async () => {
    setMockData("user_profiles", [{ user_id: "one", tier: "premium" }, { user_id: "two", tier: "free" }]);
    setMockData("summary_unlocks", [
      { user_id: "one", article_id: 10, unlocked_at: new Date().toISOString() },
      { user_id: "two", article_id: 20, unlocked_at: new Date().toISOString() },
    ]);
    setMockUser({ id: "one" });
    const one = await getNewsAccess();
    setMockUser({ id: "two" });
    const two = await getNewsAccess();
    expect(one.tier).toBe("premium"); expect([...one.unlockedIds]).toEqual([10]);
    expect(two.tier).toBe("free"); expect([...two.unlockedIds]).toEqual([20]);
    expect(two.remainingUnlocks).toBe(2);
  });
});
