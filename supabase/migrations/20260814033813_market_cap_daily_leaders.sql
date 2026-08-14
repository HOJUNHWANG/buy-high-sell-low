-- Pre-aggregate the two public podium categories so the screener never needs
-- to download every raw snapshot or depend on the Data API row limit.
CREATE OR REPLACE VIEW public.market_cap_daily_leaders
WITH (security_invoker = true)
AS
SELECT
  ranked.date,
  ranked.asset_type,
  ranked.ticker
FROM (
  SELECT
    snapshot.date,
    CASE WHEN stock.sector = 'ETF' THEN 'etfs' ELSE 'stocks' END AS asset_type,
    snapshot.ticker,
    ROW_NUMBER() OVER (
      PARTITION BY
        snapshot.date,
        CASE WHEN stock.sector = 'ETF' THEN 'etfs' ELSE 'stocks' END
      ORDER BY snapshot.market_cap DESC, snapshot.ticker ASC
    ) AS daily_rank
  FROM public.market_cap_snapshots AS snapshot
  INNER JOIN public.stocks AS stock ON stock.ticker = snapshot.ticker
  WHERE stock.is_active = true
    AND stock.sector IS DISTINCT FROM 'Cryptocurrency'
    AND snapshot.source <> 'legacy:unverified'
) AS ranked
WHERE ranked.daily_rank = 1;

COMMENT ON VIEW public.market_cap_daily_leaders IS
  'Verified daily market-cap and ETF AUM leaders used for podium streaks.';

REVOKE ALL ON TABLE public.market_cap_daily_leaders
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.market_cap_daily_leaders
  TO anon, authenticated, service_role;
