-- Keep the fictional-market retention RPC private to trusted server jobs.
-- The service role already owns DELETE privileges on all four target tables,
-- so SECURITY INVOKER preserves RLS boundaries without changing behavior.
CREATE OR REPLACE FUNCTION public.cleanup_fictional_market_data()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.fictional_price_history
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.fictional_market_events
  WHERE event_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.fictional_news
  WHERE published_at < NOW() - INTERVAL '45 days';

  DELETE FROM public.fictional_price_history_daily
  WHERE date < CURRENT_DATE - INTERVAL '366 days';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cleanup_fictional_market_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_fictional_market_data() TO service_role;

-- Company detail pages filter by ticker and then order the newswire by recency.
CREATE INDEX IF NOT EXISTS idx_fictional_events_ticker_time
  ON public.fictional_market_events (ticker, event_at DESC);

-- This legacy job attempted three VACUUM FULL statements every minute. pg_cron
-- runs a SQL job in a transaction, so the command could never succeed and only
-- generated an error every minute. Normal Supabase autovacuum remains active.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'manual-vacuum') THEN
    PERFORM cron.unschedule('manual-vacuum');
  END IF;
END;
$block$;
