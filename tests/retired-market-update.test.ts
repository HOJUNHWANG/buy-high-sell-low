import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/fictional-market/update/route";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => { throw new Error("Retired scheduler must not access the database"); }),
}));
import { createSupabaseAdmin } from "@/lib/supabase/admin";

describe("retired market scheduler", () => {
  it("makes GET and POST inert without a secret or database access", async () => {
    for (const handler of [GET, POST]) {
      const response = handler();
      expect(response.status).toBe(410);
      expect(await response.text()).toBe("");
    }
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
