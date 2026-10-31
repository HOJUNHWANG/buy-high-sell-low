// Run against disposable in-memory PostgreSQL; never reads credentials or connects remotely.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  // Upgrade an installed legacy market with both real and fictional ledgers.
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
    ${table("paper_accounts")}
    ${table("paper_positions")}
    ${table("paper_transactions")}
    ${read("supabase/migrations/20260904002321_fictional_paper_trading.sql")}
    INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000101');
    INSERT INTO public.stocks(ticker,name) VALUES ('REAL_KEEP','Preserved real asset');
    INSERT INTO public.paper_accounts(user_id,cash_balance)
      VALUES ('00000000-0000-0000-0000-000000000101',1234);
    INSERT INTO public.paper_positions(user_id,ticker,shares,avg_cost)
      VALUES ('00000000-0000-0000-0000-000000000101','REAL_KEEP',2,100);
    INSERT INTO public.paper_transactions(user_id,ticker,side,shares,price,total)
      VALUES ('00000000-0000-0000-0000-000000000101','REAL_KEEP','buy',2,100,200);
    INSERT INTO public.fictional_paper_accounts(user_id)
      VALUES ('00000000-0000-0000-0000-000000000101');
    INSERT INTO public.fictional_paper_positions(user_id,ticker,shares,avg_cost)
      VALUES ('00000000-0000-0000-0000-000000000101','IO_BASE',1,100);
    INSERT INTO public.fictional_paper_transactions
      (user_id,ticker,side,shares,price,total,cash_balance_after,price_fetched_at,
       request_id,request_unit,request_amount)
      VALUES ('00000000-0000-0000-0000-000000000101','IO_BASE','buy',1,100,100,900,now(),
       '00000000-0000-0000-0000-000000000102','shares',1);
  `);
  const realLedgerQuery = `SELECT jsonb_build_object(
    'users',(SELECT jsonb_agg(t) FROM auth.users t),
    'accounts',(SELECT jsonb_agg(t) FROM public.paper_accounts t),
    'positions',(SELECT jsonb_agg(t) FROM public.paper_positions t),
    'transactions',(SELECT jsonb_agg(t) FROM public.paper_transactions t)
  ) AS ledger`;
  const beforeRemoval = await db.query(realLedgerQuery);
  const retirementFiles = readdirSync(resolve("supabase/migrations"))
    .filter((file) => file.endsWith("_retire_fictional_market.sql"));
  assert.equal(retirementFiles.length, 1);
  const retirement = read(`supabase/migrations/${retirementFiles[0]}`);

  // An unforeseen external dependency must stop and roll back the whole migration.
  await db.exec("CREATE VIEW public.external_dependency AS SELECT ticker FROM public.fictional_companies");
  await assert.rejects(db.transaction((tx) => tx.exec(retirement)), /depend/i);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.fictional_paper_transactions")).rows[0].count, 1);
  await db.exec("DROP VIEW public.external_dependency");
  await db.transaction((tx) => tx.exec(retirement));
  assert.deepEqual((await db.query(realLedgerQuery)).rows, beforeRemoval.rows);
  assert.equal((await db.query(`SELECT count(*)::integer AS count FROM pg_tables
    WHERE schemaname='public' AND tablename LIKE 'fictional%'`)).rows[0].count, 0);
  assert.equal((await db.query(`SELECT count(*)::integer AS count FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%fictional%'`)).rows[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM private.market_maintenance_state")).rows[0].count, 0);
  assert.equal((await db.query("SELECT to_regprocedure('public.skip_unchanged_market_daily_update()') IS NOT NULL AS kept")).rows[0].kept, true);

  console.log(JSON.stringify({ status: "passed", postgres: (await db.query("SELECT version() AS version")).rows[0].version }));
} finally {
  await db.close();
}
