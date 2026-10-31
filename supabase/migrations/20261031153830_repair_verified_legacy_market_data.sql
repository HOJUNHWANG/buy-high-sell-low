SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
-- Calendar contamination: preserve exact old records before deleting them.
INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
SELECT 'market-quality-2026-10-31','price_history_long',h.ticker||':'||h.date::text,to_jsonb(h)
FROM public.price_history_long h JOIN public.stocks s USING(ticker)
WHERE s.sector IS DISTINCT FROM 'Cryptocurrency' AND (extract(isodow FROM h.date)>5 OR EXISTS(SELECT 1 FROM private.market_holidays x WHERE x.date=h.date))
ON CONFLICT DO NOTHING;
DELETE FROM public.price_history_long h USING public.stocks s
WHERE s.ticker=h.ticker AND s.sector IS DISTINCT FROM 'Cryptocurrency'
AND (extract(isodow FROM h.date)>5 OR EXISTS(SELECT 1 FROM private.market_holidays x WHERE x.date=h.date));
-- Twelve Data /time_series, split-adjusted, retrieved 2026-10-31.
INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
SELECT 'market-quality-2026-10-31','price_history_long','ABT:2026-03-23',to_jsonb(h)
FROM public.price_history_long h WHERE ticker='ABT' AND date='2026-03-23' ON CONFLICT DO NOTHING;
UPDATE public.price_history_long SET open=107.07,high=107.14,low=104.099998,close=104.85,volume=8227800,
 source='twelvedata.time_series',price_basis='split_adjusted' WHERE ticker='ABT' AND date='2026-03-23';
-- Missing original OP close for the June 5 prediction; no current-quote proxy.
INSERT INTO public.price_history_long(ticker,date,open,high,low,close,source,price_basis)
SELECT 'OP-USD','2026-06-05',0.112,0.113,0.092,0.098,'twelvedata.time_series','split_adjusted'
WHERE EXISTS(SELECT 1 FROM public.stocks WHERE ticker='OP-USD') ON CONFLICT(ticker,date) DO NOTHING;
INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
SELECT 'market-quality-2026-10-31','stocks',s.ticker,to_jsonb(s) FROM public.stocks s
WHERE ticker IN ('LRCX','GEV','AMT','BRK.B','MMM','MU','PLTR','UBER','SPCX') OR sector='Information Technology'
ON CONFLICT DO NOTHING;
UPDATE public.stocks s SET name=v.name,exchange=v.exchange,sector=v.sector,updated_at=now()
FROM (VALUES ('LRCX','Lam Research Corporation','NASDAQ','Technology'),('GEV','GE Vernova Inc.','NYSE','Industrials'),('AMT','American Tower Corporation','NYSE','Real Estate'),('BRK.B','Berkshire Hathaway Inc.','NYSE','Financial Services'),('MMM','3M Company','NYSE','Industrials'),('MU','Micron Technology, Inc.','NASDAQ','Technology'),('PLTR','Palantir Technologies Inc.','NASDAQ','Technology'),('UBER','Uber Technologies, Inc.','NYSE','Technology'))v(ticker,name,exchange,sector) WHERE s.ticker=v.ticker;
UPDATE public.stocks SET sector='Technology',updated_at=now() WHERE sector='Information Technology';
UPDATE public.stocks SET sector='Industrials',updated_at=now() WHERE ticker='SPCX';
INSERT INTO public.stocks(ticker,name,exchange,sector,is_active) VALUES
 ('EXC','Exelon Corporation','NASDAQ','Utilities',false),
 ('TGT','Target Corporation','NYSE','Consumer Defensive',false),
 ('BK','BNY (historical BK symbol)','NYSE','Financial Services',false)
ON CONFLICT(ticker) DO NOTHING;
-- Preserve the originally audited ADA observation before a fresh provider RPC
-- replaces the current value and today's snapshot.
INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
SELECT 'market-quality-2026-10-31','stocks',s.ticker,to_jsonb(s) FROM public.stocks s WHERE ticker='ADA-USD' ON CONFLICT DO NOTHING;
INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
SELECT 'market-quality-2026-10-31','market_cap_snapshots',h.ticker||':'||h.date::text,to_jsonb(h)
FROM public.market_cap_snapshots h WHERE ticker='ADA-USD' AND date='2026-10-31' ON CONFLICT DO NOTHING;
-- Reclaim only abandoned operational logs. Never truncate an active cron log.
DO $cron$
DECLARE n bigint; first_time timestamptz; last_time timestamptz;
BEGIN
 SELECT count(*),min(start_time),max(end_time) INTO n,first_time,last_time FROM cron.job_run_details;
 IF n>0 AND last_time<now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM cron.job) THEN
   INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
   VALUES('operational-retention-2026-10-31','cron.job_run_details','aggregate',jsonb_build_object('rows',n,'oldest',first_time,'latest',last_time)) ON CONFLICT DO NOTHING;
   TRUNCATE TABLE cron.job_run_details;
 END IF;
END;
$cron$;
