-- Run after reduce_market_ingestion_io. All fixtures are rolled back.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  affected integer;
BEGIN
  INSERT INTO public.stocks (ticker, name)
  VALUES ('__BHSL_IO_TEST__', 'Rollback-only ingestion fixture');
  INSERT INTO public.stock_prices (ticker, price, fetched_at)
  VALUES ('__BHSL_IO_TEST__', 100, now() - INTERVAL '10 minutes');
  UPDATE public.stock_prices SET fetched_at = now()
  WHERE ticker = '__BHSL_IO_TEST__';
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 1, 'current-price freshness must update even when price is unchanged';

  INSERT INTO public.price_history_long (ticker, date, close)
  VALUES ('__BHSL_IO_TEST__', CURRENT_DATE, 100);

  INSERT INTO public.price_history_long (ticker, date, close)
  VALUES ('__BHSL_IO_TEST__', CURRENT_DATE, 100)
  ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 0, 'identical real daily upsert must skip heap update';

  UPDATE public.price_history_long SET close = 101, volume = 500
  WHERE ticker = '__BHSL_IO_TEST__' AND date = CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 1, 'changed daily close and volume must still update';

  UPDATE public.price_history_long SET volume = NULL
  WHERE ticker = '__BHSL_IO_TEST__' AND date = CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 1, 'NULL transitions must not be suppressed';

  INSERT INTO public.fictional_companies
    (ticker, name, source, exchange, sector, risk, market_cap, base_price,
     float_shares, volatility, influence, technology, color, accent, note)
  SELECT '__BHSL_IO_TEST__', name, source, exchange, sector, risk, market_cap,
    base_price, float_shares, volatility, influence, technology, color, accent, note
  FROM public.fictional_companies LIMIT 1;

  INSERT INTO public.fictional_price_history_daily
    (ticker, date, open, high, low, close, volume)
  VALUES ('__BHSL_IO_TEST__', CURRENT_DATE, 100, 101, 99, 100, 500);
  UPDATE public.fictional_price_history_daily SET close = 100
  WHERE ticker = '__BHSL_IO_TEST__' AND date = CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 0, 'identical fictional daily update must be skipped';
  UPDATE public.fictional_price_history_daily SET high = 102
  WHERE ticker = '__BHSL_IO_TEST__' AND date = CURRENT_DATE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 1, 'changed fictional daily high must still update';

  -- A fresh marker must prevent a second retention scan, even with expired data.
  INSERT INTO private.market_maintenance_state (job_name, last_completed_at)
  VALUES ('fictional_market_retention', now())
  ON CONFLICT (job_name) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
  INSERT INTO public.fictional_price_history_daily
    (ticker, date, open, high, low, close, volume)
  VALUES ('__BHSL_IO_TEST__', CURRENT_DATE - 367, 100, 101, 99, 100, 500);
  PERFORM public.cleanup_fictional_market_data();
  ASSERT EXISTS (
    SELECT 1 FROM public.fictional_price_history_daily
    WHERE ticker = '__BHSL_IO_TEST__' AND date = CURRENT_DATE - 367
  ), 'cleanup called within one hour must skip retention';

  ASSERT NOT has_function_privilege('anon', 'public.cleanup_fictional_market_data()', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.cleanup_fictional_market_data()', 'EXECUTE');
  ASSERT NOT has_schema_privilege('anon', 'private', 'USAGE');
  ASSERT NOT has_schema_privilege('authenticated', 'private', 'USAGE');
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.price_history_long'::regclass
      AND conname = 'price_history_long_new_ticker_date_key'
  ), 'duplicate UNIQUE constraint must be removed';
END;
$test$;

SELECT 'market ingestion SQL assertions passed; fixtures rolled back' AS result;
ROLLBACK;
