import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import DataHealthPage from "@/app/admin/data-health/page";
import { setMockUser } from "./setup";

const admin = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdmin: () => admin }));
vi.mock("@/components/LiveDataRefresh", () => ({ LiveDataRefresh: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
  setMockUser(null);
});

it("shows the last stock and settlement runs after newer jobs fill the recent log", async () => {
  vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
  setMockUser({ id: "admin", email: "admin@example.test" });

  const lookup = vi.fn((job: string) => ({
    order: () => ({ limit: () => ({
      maybeSingle: async () => ({
        data: {
          job_name: job, status: "success", executed_at: "2026-11-20T21:55:19Z",
          records_fetched: 114, records_failed: 0,
        },
        error: null,
      }),
    }) }),
  }));
  admin.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (_field: string, job: string) => lookup(job),
      order: () => ({
        limit: async () => ({ data: table === "fetch_logs" ? [{
          id: 5, job_name: "crypto_prices", status: "success", executed_at: "2026-11-21T14:01:24Z",
          records_fetched: 19, records_failed: 0,
        }] : [], error: null }),
      }),
    }),
  }));
  admin.rpc.mockResolvedValue({ data: null });

  const html = renderToStaticMarkup(await DataHealthPage());

  expect(lookup.mock.calls.map(([job]) => job)).toEqual(["prices", "prices_close_settlement"]);
  expect(html).toContain("Last settlement close success");
  expect(html).toContain("with 114 records fetched.");
  expect(html).not.toContain("No log");
});
