SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.repair_archive (
 repair_id text NOT NULL, source_table text NOT NULL, source_key text NOT NULL,
 record jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repair_id,source_table,source_key)
);
CREATE TABLE IF NOT EXISTS private.news_evidence (
 article_id bigint PRIMARY KEY REFERENCES public.news_articles(id) ON DELETE CASCADE,
 source_text text NOT NULL CHECK(length(source_text)<=16000), evidence jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.news_feed_health (
 feed_url text PRIMARY KEY, checked_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL
);
ALTER TABLE private.repair_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.news_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.news_feed_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.repair_archive,private.news_evidence,private.news_feed_health FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.repair_archive,private.news_evidence,private.news_feed_health TO service_role;
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS summary_method text NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS source_coverage text NOT NULL DEFAULT 'headline';
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS news_category text NOT NULL DEFAULT 'unclassified';
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS relevance_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE public.news_articles ADD COLUMN IF NOT EXISTS quality_version integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS news_articles_pending_quality ON public.news_articles(quality_version,published_at DESC) WHERE quality_version<2;
CREATE INDEX IF NOT EXISTS news_articles_event_recent ON public.news_articles(event_key,published_at DESC);

CREATE OR REPLACE FUNCTION public.write_news_analysis(p_article_id bigint,p_public jsonb,p_evidence jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $write$
DECLARE prior public.news_articles%ROWTYPE; tags text[];
BEGIN
 SELECT * INTO STRICT prior FROM public.news_articles WHERE id=p_article_id FOR UPDATE;
 IF p_public->>'summary_method' NOT IN ('verified_ai','source_excerpt','headline_only')
   OR p_public->>'source_coverage' NOT IN ('headline','lead','full_text') THEN
   RAISE EXCEPTION 'Invalid news provenance';
 END IF;
 INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
 VALUES('news-quality-v2','news_articles',p_article_id::text,to_jsonb(prior)) ON CONFLICT DO NOTHING;
 SELECT coalesce(array_agg(DISTINCT x.ticker),'{}'::text[]) INTO tags
 FROM jsonb_array_elements_text(coalesce(p_public->'related_tickers','[]')) t(ticker)
 JOIN public.stocks x ON x.ticker=t.ticker;
 INSERT INTO private.news_evidence(article_id,source_text,evidence)
 VALUES(p_article_id,left(coalesce(p_evidence->>'source_text',''),16000),p_evidence-'source_text')
 ON CONFLICT(article_id) DO UPDATE SET source_text=excluded.source_text,evidence=excluded.evidence,updated_at=now();
 UPDATE public.news_articles SET related_tickers=tags,ticker=NULL,
 ai_summary=nullif(p_public->>'ai_summary',''), ai_insight=nullif(p_public->>'ai_insight',''),
 ai_sentiment=CASE WHEN p_public->>'ai_sentiment' IN ('positive','neutral','negative') THEN p_public->>'ai_sentiment' ELSE NULL END,
 ai_caution=nullif(p_public->>'ai_caution',''), ai_generated_at=now(),
 summary_method=p_public->>'summary_method',source_coverage=p_public->>'source_coverage',
 news_category=p_public->>'news_category',relevance_score=least(100,greatest(0,coalesce((p_public->>'relevance_score')::int,0))),
 event_key=p_public->>'event_key',quality_version=2 WHERE id=p_article_id;
END;
$write$;
REVOKE ALL ON FUNCTION public.write_news_analysis(bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_news_analysis(bigint,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.write_news_analysis_batch(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $batch$
DECLARE item jsonb; n integer:=0;
BEGIN
 IF jsonb_array_length(p_items)>200 THEN RAISE EXCEPTION 'News batch too large'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   PERFORM public.write_news_analysis((item->>'id')::bigint,item->'public',item->'evidence'); n:=n+1;
 END LOOP;
 RETURN n;
END;
$batch$;
REVOKE ALL ON FUNCTION public.write_news_analysis_batch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_news_analysis_batch(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.write_news_feed_health(p_results jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $health$
 INSERT INTO private.news_feed_health(feed_url,details)
 SELECT value->>'feed_url',value FROM jsonb_array_elements(p_results)
 ON CONFLICT(feed_url) DO UPDATE SET details=excluded.details,checked_at=now();
$health$;
REVOKE ALL ON FUNCTION public.write_news_feed_health(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_news_feed_health(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_news_quality_health()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $health_read$
 SELECT jsonb_build_object('feeds',coalesce((SELECT jsonb_agg(details||jsonb_build_object('checked_at',checked_at) ORDER BY feed_url) FROM private.news_feed_health),'[]'::jsonb),
 'coverage',(SELECT jsonb_build_object('total',count(*),'checked',count(*) FILTER(WHERE summary_method='verified_ai'),'excerpts',count(*) FILTER(WHERE summary_method='source_excerpt'),'headlines',count(*) FILTER(WHERE summary_method='headline_only'),'unreviewed',count(*) FILTER(WHERE quality_version<2)) FROM public.news_articles WHERE published_at>now()-interval '24 hours'));
$health_read$;
REVOKE ALL ON FUNCTION public.get_news_quality_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_news_quality_health() TO service_role;

NOTIFY pgrst, 'reload schema';
