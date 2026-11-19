SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Switch the reviewed legacy favicon URLs to the existing CSP-approved image host.
UPDATE public.stocks AS stock
SET logo_url = 'https://financialmodelingprep.com/image-stock/' || stock.ticker || '.png',
    updated_at = now()
FROM (VALUES
  ('ADBE', 'adobe.com'),
  ('AMAT', 'appliedmaterials.com'),
  ('COST', 'costco.com'),
  ('CVX', 'chevron.com'),
  ('DIA', 'ssga.com'),
  ('GLD', 'ssga.com'),
  ('SPCX', 'spacex.com'),
  ('XLK', 'ssga.com')
) AS legacy(ticker, domain)
WHERE stock.ticker = legacy.ticker
  AND stock.is_active
  AND stock.logo_url = 'https://www.google.com/s2/favicons?domain=' || legacy.domain || '&sz=128';

-- Backfill direct IPO headlines ingested before the ANT-aware news worker deployed.
-- Preserve the published analysis, existing ticker tags, and retrieval timestamps.
WITH articles AS MATERIALIZED (
  SELECT n.id, to_jsonb(n) AS previous
  FROM public.news_articles AS n
  WHERE n.quality_version >= 2
    AND n.published_at >= TIMESTAMPTZ '2026-11-18 00:00:00-05'
    AND n.fetched_at < TIMESTAMPTZ '2026-11-19 18:14:46-05'
    AND n.title ~* '\mAnthropic\M'
    AND n.title ~* '\m(IPOs?|listings?|debut[[:alpha:]]*)\M'
    AND n.title ~* '\m(IPO|stock|shares?|earnings|revenue|profit|guidance|ETF|fund|SEC|lawsuit|launch[[:alpha:]]*|contracts?|partnership|chips?|cloud|approval|CEO|CFO)\M'
    AND NOT coalesce('ANT' = ANY(n.related_tickers), false)
    AND EXISTS (SELECT 1 FROM public.stocks WHERE ticker = 'ANT' AND is_active)
  FOR UPDATE OF n
), archived AS (
  INSERT INTO private.repair_archive(repair_id, source_table, source_key, record)
  SELECT 'anthropic-ipo-tags', 'news_articles', id::text, previous FROM articles
  UNION ALL
  SELECT 'anthropic-ipo-tags', 'news_evidence', e.article_id::text, to_jsonb(e)
  FROM private.news_evidence AS e
  JOIN articles AS a ON a.id = e.article_id
  ON CONFLICT DO NOTHING
), tagged AS (
  UPDATE public.news_articles AS n
  SET related_tickers = array_append(coalesce(n.related_tickers, '{}'::text[]), 'ANT')
  FROM articles AS a
  WHERE n.id = a.id
  RETURNING n.id, n.title
)
UPDATE private.news_evidence AS e
SET evidence = jsonb_set(
  e.evidence, '{entities}',
  coalesce(e.evidence->'entities', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'ticker', 'ANT', 'alias', 'Anthropic', 'relationship', 'direct', 'confidence', 0.99,
    'evidence', left(tagged.title, 350)
  ))
), updated_at = now()
FROM tagged
WHERE e.article_id = tagged.id
  AND jsonb_typeof(coalesce(e.evidence->'entities', '[]'::jsonb)) = 'array'
  AND NOT coalesce((e.evidence->'entities') @> '[{"ticker":"ANT"}]'::jsonb, false);
