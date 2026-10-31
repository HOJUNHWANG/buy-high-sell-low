-- CONTRACT: apply only after the atomic API deployment is healthy.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
REVOKE ALL ON public.paper_accounts,public.paper_positions,public.paper_transactions,public.paper_ai_usage FROM anon,authenticated;
GRANT SELECT ON public.paper_accounts,public.paper_positions,public.paper_transactions,public.paper_ai_usage TO authenticated;
REVOKE ALL ON SEQUENCE public.paper_positions_id_seq,public.paper_transactions_id_seq FROM anon,authenticated;
DO $policies$
DECLARE p record; q text; c text;
BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' LOOP
   IF p.tablename IN ('paper_accounts','paper_positions','paper_transactions','paper_ai_usage') AND p.cmd<>'SELECT' THEN
     EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
   ELSIF (coalesce(p.qual,'') LIKE '%auth.uid()%' AND coalesce(p.qual,'') NOT LIKE '%SELECT auth.uid()%')
     OR (coalesce(p.with_check,'') LIKE '%auth.uid()%' AND coalesce(p.with_check,'') NOT LIKE '%SELECT auth.uid()%') THEN
     q:=CASE WHEN p.qual IS NULL THEN '' ELSE ' USING ('||replace(p.qual,'auth.uid()','(SELECT auth.uid())')||')' END;
     c:=CASE WHEN p.with_check IS NULL THEN '' ELSE ' WITH CHECK ('||replace(p.with_check,'auth.uid()','(SELECT auth.uid())')||')' END;
     EXECUTE format('ALTER POLICY %I ON public.%I',p.policyname,p.tablename)||q||c;
   END IF;
 END LOOP;
END;
$policies$;
CREATE SCHEMA IF NOT EXISTS extensions;
DO $extension$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm' AND n.nspname<>'extensions') THEN
 ALTER EXTENSION pg_trgm SET SCHEMA extensions;
 END IF;
END; $extension$;
GRANT USAGE ON SCHEMA extensions TO anon,authenticated,service_role;

GRANT USAGE ON SCHEMA cron TO service_role;
GRANT SELECT,DELETE ON cron.job_run_details TO service_role;
CREATE OR REPLACE FUNCTION public.maintain_operational_history()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $retention$
DECLARE cron_rows integer; receipts integer;
BEGIN
 DELETE FROM cron.job_run_details WHERE runid IN (SELECT runid FROM cron.job_run_details WHERE end_time<now()-interval '30 days' ORDER BY runid LIMIT 10000);
 GET DIAGNOSTICS cron_rows=ROW_COUNT;
 DELETE FROM private.paper_action_receipts WHERE (user_id,request_id) IN (
   SELECT user_id,request_id FROM private.paper_action_receipts WHERE created_at<now()-interval '90 days' ORDER BY created_at LIMIT 5000);
 GET DIAGNOSTICS receipts=ROW_COUNT;
 RETURN jsonb_build_object('cron_rows',cron_rows,'expired_receipts',receipts);
END;
$retention$;
REVOKE ALL ON FUNCTION public.maintain_operational_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_operational_history() TO service_role;

DO $cap_path$ BEGIN
 IF to_regprocedure('public.upsert_market_cap_observation(text,bigint,timestamptz,text,text)') IS NOT NULL THEN
 ALTER FUNCTION public.upsert_market_cap_observation(text,bigint,timestamptz,text,text) SET search_path='';
 END IF;
END; $cap_path$;

NOTIFY pgrst, 'reload schema';
