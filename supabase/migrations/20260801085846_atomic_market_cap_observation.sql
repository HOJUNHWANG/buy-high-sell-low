CREATE OR REPLACE FUNCTION public.upsert_market_cap_observation(
  p_ticker TEXT,
  p_market_cap BIGINT,
  p_observed_at TIMESTAMPTZ,
  p_source TEXT,
  p_metric TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_market_cap <= 0 THEN
    RAISE EXCEPTION 'market cap must be positive';
  END IF;
  IF p_source IS NULL OR btrim(p_source) = '' THEN
    RAISE EXCEPTION 'market cap source is required';
  END IF;
  IF p_metric NOT IN ('equity_market_cap', 'circulating_market_cap', 'aum') THEN
    RAISE EXCEPTION 'invalid market cap metric: %', p_metric;
  END IF;

  UPDATE public.stocks
  SET
    market_cap = p_market_cap,
    market_cap_updated_at = p_observed_at,
    market_cap_source = p_source,
    market_cap_metric = p_metric,
    updated_at = p_observed_at
  WHERE ticker = upper(p_ticker);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown market ticker: %', p_ticker;
  END IF;

  INSERT INTO public.market_cap_snapshots (
    ticker,
    date,
    market_cap,
    observed_at,
    source,
    metric
  )
  VALUES (
    upper(p_ticker),
    (p_observed_at AT TIME ZONE 'UTC')::date,
    p_market_cap,
    p_observed_at,
    p_source,
    p_metric
  )
  ON CONFLICT (ticker, date)
  DO UPDATE SET
    market_cap = EXCLUDED.market_cap,
    observed_at = EXCLUDED.observed_at,
    source = EXCLUDED.source,
    metric = EXCLUDED.metric;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_market_cap_observation(
  TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_market_cap_observation(
  TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;
