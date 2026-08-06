-- Secure the two public-schema tables reported with RLS disabled.

-- ai_why_usage is written by an authenticated server client. The primary key
-- makes the insert an atomic once-per-user/day/ticker claim.
ALTER TABLE public.ai_why_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_why_usage FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ai_why_usage TO authenticated;

DROP POLICY IF EXISTS "users can read own ai why usage" ON public.ai_why_usage;
DROP POLICY IF EXISTS "users can insert own ai why usage" ON public.ai_why_usage;
DROP POLICY IF EXISTS "users can delete own ai why usage" ON public.ai_why_usage;
CREATE POLICY "users can read own ai why usage"
  ON public.ai_why_usage FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can insert own ai why usage"
  ON public.ai_why_usage FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can delete own ai why usage"
  ON public.ai_why_usage FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Briefs are public read-only data. Canonical generators keep writing with the
-- service role, which bypasses RLS.
ALTER TABLE public.market_briefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.market_briefs FROM anon, authenticated;
GRANT SELECT ON TABLE public.market_briefs TO anon, authenticated;

DROP POLICY IF EXISTS "public read market briefs" ON public.market_briefs;
CREATE POLICY "public read market briefs"
  ON public.market_briefs FOR SELECT TO anon, authenticated
  USING (true);
