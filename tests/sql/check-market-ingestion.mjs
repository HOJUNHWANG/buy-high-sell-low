// Run against disposable in-memory PostgreSQL; never reads credentials or connects remotely.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packagePath = process.argv[2];
const { PGlite } = await import(packagePath ? pathToFileURL(resolve(packagePath)).href : "@electric-sql/pglite");
const db = await PGlite.create();
const read = (path) => readFileSync(resolve(path), "utf8");
const schema = read("supabase/schema.sql");
const table = (name) => {
  const match = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`));
  assert.ok(match, `Missing fixture definition for ${name}`);
  return match[0];
};

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    ${table("stocks")}
    ${table("stock_prices")}
    ${table("stock_price_history")}
    ${table("price_history_long")}
    ${read("supabase/migrations/20260709_fictional_market.sql").split("CREATE INDEX")[0]}
    ALTER TABLE public.price_history_long ADD CONSTRAINT price_history_long_new_ticker_date_key UNIQUE (ticker, date);
    ALTER TABLE public.price_history_long ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fictional_price_history_daily ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    INSERT INTO public.fictional_companies
      (ticker, name, source, exchange, sector, risk, market_cap, base_price,
       float_shares, volatility, influence, technology, color, accent, note)
    VALUES ('IO_BASE', 'Local fixture', 'fixture', 'FICTDAQ', 'Tech', 'Low',
      1000, 100, 10, 1, 50, 50, 'blue', 'blue', 'fixture');
  `);

  await db.transaction((tx) => tx.exec(read("supabase/migrations/20261015213638_reduce_market_ingestion_io.sql")));
  await db.transaction((tx) => tx.exec(read("supabase/migrations/20261015213711_remove_duplicate_daily_price_constraint.sql")));
  const results = await db.exec(read("tests/sql/market-ingestion-io.sql"));
  assert.ok(results.some((result) => result.rows?.[0]?.result?.includes("assertions passed")));

  // Also exercise an eligible cleanup; only disposable fixture data exists here.
  await db.exec(`
    INSERT INTO public.fictional_price_history_daily (ticker, date, open, high, low, close, volume)
    VALUES ('IO_BASE', CURRENT_DATE - 367, 100, 100, 100, 100, 1),
           ('IO_BASE', CURRENT_DATE, 100, 100, 100, 100, 1);
    SET ROLE service_role;
    SELECT public.cleanup_fictional_market_data();
    RESET ROLE;
  `);
  const retained = await db.query("SELECT date = CURRENT_DATE AS current FROM public.fictional_price_history_daily WHERE ticker = 'IO_BASE'");
  assert.deepEqual(retained.rows, [{ current: true }]);
  const state = await db.query("SELECT count(*)::integer AS count FROM private.market_maintenance_state");
  assert.equal(state.rows[0].count, 1);
  const rolledBack = await db.query("SELECT count(*)::integer AS count FROM public.stocks WHERE ticker = '__BHSL_IO_TEST__'");
  assert.equal(rolledBack.rows[0].count, 0);
  console.log(JSON.stringify({ status: "passed", postgres: (await db.query("SELECT version() AS version")).rows[0].version }));
} finally {
  await db.close();
}
