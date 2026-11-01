SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

CREATE INDEX IF NOT EXISTS news_articles_published_id
  ON public.news_articles (published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS price_history_long_date_ticker
  ON public.price_history_long (date, ticker) INCLUDE (close);

CREATE TABLE IF NOT EXISTS private.news_retry_queue (
  article_id bigint PRIMARY KEY REFERENCES public.news_articles(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.news_retry_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.news_retry_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.news_retry_queue TO service_role;
CREATE INDEX IF NOT EXISTS news_retry_queue_due
  ON private.news_retry_queue (next_attempt_at, article_id) WHERE attempts < 4;

CREATE OR REPLACE FUNCTION public.write_news_analysis_v3(
  p_article_id bigint, p_public jsonb, p_evidence jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $write$
DECLARE
  prior public.news_articles%ROWTYPE;
  attempt integer := least(4, greatest(0, coalesce((p_evidence->>'retry_attempt')::integer, 0)));
  delay_seconds integer;
BEGIN
  SELECT * INTO STRICT prior FROM public.news_articles WHERE id = p_article_id FOR UPDATE;
  -- A transient failure or an old worker cannot replace a verified result.
  IF prior.summary_method = 'verified_ai' AND p_public->>'summary_method' <> 'verified_ai' THEN
    DELETE FROM private.news_retry_queue WHERE article_id = p_article_id;
    RETURN;
  END IF;
  IF prior.quality_version = 2 THEN
    INSERT INTO private.repair_archive(repair_id, source_table, source_key, record)
    VALUES ('news-quality-v3', 'news_articles', p_article_id::text, to_jsonb(prior)) ON CONFLICT DO NOTHING;
    INSERT INTO private.repair_archive(repair_id, source_table, source_key, record)
    SELECT 'news-quality-v3', 'news_evidence', p_article_id::text, to_jsonb(e)
    FROM private.news_evidence e WHERE e.article_id = p_article_id ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.write_news_analysis(p_article_id, p_public, p_evidence);
  UPDATE public.news_articles SET quality_version = 3 WHERE id = p_article_id;

  IF p_public->>'summary_method' <> 'verified_ai'
     AND coalesce((p_evidence->>'retryable')::boolean, false)
     AND attempt < 4 AND prior.published_at > now() - interval '72 hours' THEN
    delay_seconds := greatest(
      CASE attempt WHEN 0 THEN 1800 WHEN 1 THEN 7200 WHEN 2 THEN 21600 ELSE 43200 END,
      least(43200, greatest(1800, coalesce((p_evidence->>'retry_after_seconds')::integer, 1800)))
    );
    INSERT INTO private.news_retry_queue(article_id, attempts, next_attempt_at, last_reason)
    VALUES (p_article_id, attempt, now() + make_interval(secs => delay_seconds),
      left(coalesce(p_evidence->>'analysis_status', p_evidence->>'source_status', 'deferred'), 100))
    ON CONFLICT(article_id) DO UPDATE SET
      attempts = greatest(private.news_retry_queue.attempts, excluded.attempts),
      next_attempt_at = excluded.next_attempt_at, last_reason = excluded.last_reason, updated_at = now();
  ELSE
    DELETE FROM private.news_retry_queue WHERE article_id = p_article_id;
  END IF;
END;
$write$;
REVOKE ALL ON FUNCTION public.write_news_analysis_v3(bigint,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_news_analysis_v3(bigint,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_news_retry_candidates(p_limit integer DEFAULT 20)
RETURNS TABLE(id bigint, title text, url text, published_at timestamptz, source_text text, attempts integer, source_status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $read$
  SELECT n.id, n.title, n.url, n.published_at, coalesce(e.source_text, ''), q.attempts, e.evidence->>'source_status'
  FROM private.news_retry_queue q
  JOIN public.news_articles n ON n.id = q.article_id
  LEFT JOIN private.news_evidence e ON e.article_id = n.id
  WHERE q.next_attempt_at <= now() AND q.attempts < 4
    AND n.published_at > now() - interval '72 hours'
    AND n.summary_method <> 'verified_ai'
  ORDER BY q.next_attempt_at, n.relevance_score DESC, n.published_at DESC, n.id DESC
  LIMIT least(120, greatest(0, p_limit));
$read$;
REVOKE ALL ON FUNCTION public.get_news_retry_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_news_retry_candidates(integer) TO service_role;

-- Queue only recent, market-relevant legacy results. Originals are archived
-- transactionally when each article is actually reanalysed, not at enqueue time.
INSERT INTO private.news_retry_queue(article_id, last_reason)
SELECT n.id, 'source_recovery_v3' FROM public.news_articles n
WHERE n.published_at > now() - interval '72 hours' AND n.published_at <= now() + interval '5 minutes'
  AND n.quality_version = 2 AND n.summary_method IN ('headline_only', 'source_excerpt')
  AND (n.relevance_score >= 35 OR n.url LIKE 'https://cointelegraph.com/%' OR n.url LIKE 'https://www.fool.com/%')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
