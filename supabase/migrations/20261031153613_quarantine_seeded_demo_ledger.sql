-- Run after the compatible API and write lockdown are deployed.
-- Match only the seed script's literal dummy_...@bhsl.local identities.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $quarantine$
DECLARE target text; before_hash text; after_hash text; missing integer;
BEGIN
 SELECT md5(coalesce(string_agg(a.user_id::text||':'||a.cash_balance::text,',' ORDER BY a.user_id),'')) INTO before_hash
 FROM public.paper_accounts a WHERE NOT EXISTS(SELECT 1 FROM private.demo_users d WHERE d.user_id=a.user_id);
 IF to_regclass('public.leaderboard_reactions') IS NOT NULL THEN
   INSERT INTO private.demo_ledger_archive(source_table,source_key,user_id,record)
   SELECT 'leaderboard_reactions',r.id::text,r.user_id,to_jsonb(r) FROM public.leaderboard_reactions r
   WHERE EXISTS(SELECT 1 FROM private.demo_users d WHERE r.user_id=d.user_id OR r.target_id::text=d.user_id::text)
   ON CONFLICT DO NOTHING;
   IF EXISTS(SELECT 1 FROM public.leaderboard_reactions r
     WHERE EXISTS(SELECT 1 FROM private.demo_users d WHERE r.user_id=d.user_id OR r.target_id::text=d.user_id::text)
     AND NOT EXISTS(SELECT 1 FROM private.demo_ledger_archive a WHERE a.source_table='leaderboard_reactions' AND a.record=to_jsonb(r))) THEN
     RAISE EXCEPTION 'Demo reaction archive incomplete';
   END IF;
   DELETE FROM public.leaderboard_reactions r USING private.demo_users d WHERE r.user_id=d.user_id OR r.target_id::text=d.user_id::text;
 END IF;
 FOREACH target IN ARRAY ARRAY['paper_positions','paper_transactions','paper_challenges','paper_graveyard','paper_achievements','paper_ai_usage','watchlist','user_preferences','user_profiles','ai_why_usage','summary_unlocks','paper_accounts'] LOOP
   IF to_regclass('public.'||target) IS NULL THEN CONTINUE; END IF;
   EXECUTE format('INSERT INTO private.demo_ledger_archive(source_table,source_key,user_id,record)
     SELECT %L,coalesce(to_jsonb(t)->>''id'',md5(to_jsonb(t)::text)),t.user_id,to_jsonb(t)
     FROM public.%I t JOIN private.demo_users d USING(user_id) ON CONFLICT DO NOTHING',target,target);
   EXECUTE format('SELECT count(*) FROM public.%I t JOIN private.demo_users d USING(user_id)
     WHERE NOT EXISTS(SELECT 1 FROM private.demo_ledger_archive a WHERE a.source_table=%L AND a.record=to_jsonb(t))',target,target) INTO missing;
   IF missing<>0 THEN RAISE EXCEPTION 'Demo archive incomplete for %',target; END IF;
   EXECUTE format('DELETE FROM public.%I t USING private.demo_users d WHERE t.user_id=d.user_id',target);
 END LOOP;
 SELECT md5(coalesce(string_agg(a.user_id::text||':'||a.cash_balance::text,',' ORDER BY a.user_id),'')) INTO after_hash
 FROM public.paper_accounts a WHERE NOT EXISTS(SELECT 1 FROM private.demo_users d WHERE d.user_id=a.user_id);
 IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'Genuine account fingerprint changed'; END IF;
END;
$quarantine$;
