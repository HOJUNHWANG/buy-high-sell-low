-- Prevent caller-controlled schema resolution inside the retention function.

CREATE OR REPLACE FUNCTION public.cleanup_old_prices()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  DELETE FROM public.stock_price_history
  WHERE recorded_at < NOW() - INTERVAL '400 days';
$$;
