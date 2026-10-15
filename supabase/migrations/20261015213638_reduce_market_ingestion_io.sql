-- Keep the 10-minute quote cadence, intraday samples and live daily candles.
-- Short lock waits make a busy deployment fail instead of stalling ingestion.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- Skip heap/WAL updates only when the ENTIRE daily row is unchanged.
-- Current-price tables are deliberately excluded: fetched_at must stay fresh.
CREATE OR REPLACE FUNCTION public.skip_unchanged_market_daily_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.skip_unchanged_market_daily_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_unchanged_market_daily_update() TO service_role;

CREATE TRIGGER skip_unchanged_price_history_long
BEFORE UPDATE ON public.price_history_long
FOR EACH ROW WHEN (OLD.* IS NOT DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.skip_unchanged_market_daily_update();

CREATE TRIGGER skip_unchanged_fictional_daily
BEFORE UPDATE ON public.fictional_price_history_daily
FOR EACH ROW WHEN (OLD.* IS NOT DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.skip_unchanged_market_daily_update();

-- Keep retention callable by both existing writers, but scan the four history
-- tables at most once an hour. A failed cleanup must not advance the marker.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE private.market_maintenance_state (
  job_name text PRIMARY KEY,
  last_completed_at timestamptz NOT NULL
);
ALTER TABLE private.market_maintenance_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.market_maintenance_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.market_maintenance_state TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_fictional_market_data()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('bhsl:fictional-market-retention', 0)
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.market_maintenance_state
    WHERE job_name = 'fictional_market_retention'
      AND last_completed_at > now() - INTERVAL '1 hour'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.fictional_price_history
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.fictional_market_events
  WHERE event_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.fictional_news
  WHERE published_at < NOW() - INTERVAL '45 days';

  DELETE FROM public.fictional_price_history_daily
  WHERE date < CURRENT_DATE - INTERVAL '366 days';

  INSERT INTO private.market_maintenance_state (job_name, last_completed_at)
  VALUES ('fictional_market_retention', now())
  ON CONFLICT (job_name) DO UPDATE
  SET last_completed_at = EXCLUDED.last_completed_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cleanup_fictional_market_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_fictional_market_data() TO service_role;
