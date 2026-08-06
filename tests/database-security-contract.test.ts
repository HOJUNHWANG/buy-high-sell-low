import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migration(name: string): string {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", name),
    "utf8",
  );
}

describe("database mutation security contracts", () => {
  it("keeps quota and challenge mutations server-only", () => {
    const sql = migration(
      "20260806231916_lock_down_api_mutations.sql",
    );

    for (const table of ["ai_why_usage", "summary_unlocks", "paper_challenges"]) {
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
      expect(sql).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`);
    }
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_summary_unlock(UUID, BIGINT, INTEGER)\n  TO service_role",
    );
    expect(sql).toContain(
      "FROM PUBLIC, anon, authenticated",
    );
  });

  it("runs public theme synchronization under caller RLS", () => {
    const sql = migration(
      "20260806232111_use_invoker_for_theme_sync.sql",
    );

    expect(sql).toContain(
      "ALTER FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)\n  SECURITY INVOKER",
    );
    expect(sql).toContain(
      "WITH CHECK ((SELECT auth.uid()) = user_id)",
    );
  });
});
