-- Deploy the retired update endpoint and remove runtime readers before applying.
-- The user requested permanent removal of the separate simulated market/ledger.
-- Explicit dependency order and RESTRICT (the default) protect unrelated objects.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DROP FUNCTION IF EXISTS public.execute_fictional_paper_trade(uuid,text,text,text,numeric,uuid);
DROP FUNCTION IF EXISTS public.fictional_paper_leaderboard(uuid);
DROP FUNCTION IF EXISTS public.cleanup_fictional_market_data();

DROP TABLE IF EXISTS public.fictional_paper_transactions;
DROP TABLE IF EXISTS public.fictional_paper_positions;
DROP TABLE IF EXISTS public.fictional_paper_accounts;
DROP TABLE IF EXISTS public.fictional_news;
DROP TABLE IF EXISTS public.fictional_market_events;
DROP TABLE IF EXISTS public.fictional_price_history;
DROP TABLE IF EXISTS public.fictional_price_history_daily;
DROP TABLE IF EXISTS public.fictional_prices;
DROP TABLE IF EXISTS public.fictional_companies;

DELETE FROM private.market_maintenance_state
WHERE job_name = 'fictional_market_retention';
-- Keep the shared daily-price trigger function and generic maintenance table.
