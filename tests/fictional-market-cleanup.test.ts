import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260731024134_harden_fictional_market_cleanup.sql"),
  "utf8",
);

describe("fictional market cleanup migration", () => {
  it("keeps the cleanup RPC invoker-only and restricted to the service role", () => {
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).not.toMatch(/SECURITY DEFINER/i);
    expect(migration).toMatch(/SET search_path = ''/i);
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.cleanup_fictional_market_data\(\) FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cleanup_fictional_market_data\(\) TO service_role/i,
    );

    for (const table of [
      "fictional_price_history",
      "fictional_market_events",
      "fictional_news",
      "fictional_price_history_daily",
    ]) {
      expect(migration).toContain(`DELETE FROM public.${table}`);
    }
  });

  it("indexes ticker newswire reads and removes the broken vacuum job", () => {
    expect(migration).toMatch(
      /ON public\.fictional_market_events \(ticker, event_at DESC\)/i,
    );
    expect(migration).toContain("cron.unschedule('manual-vacuum')");
  });
});
