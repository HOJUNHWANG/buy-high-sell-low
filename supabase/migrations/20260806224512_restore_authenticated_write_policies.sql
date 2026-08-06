-- Restore the exact authenticated mutations used by existing API routes.

-- Summary unlocks were readable but not insertable under RLS, so the route
-- could return success while no permanent unlock was stored.
REVOKE ALL ON TABLE public.summary_unlocks FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.summary_unlocks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.summary_unlocks_id_seq TO authenticated;

DROP POLICY IF EXISTS "users can read own summary_unlocks" ON public.summary_unlocks;
DROP POLICY IF EXISTS "users can insert own summary_unlocks" ON public.summary_unlocks;
CREATE POLICY "users can read own summary_unlocks"
  ON public.summary_unlocks FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can insert own summary_unlocks"
  ON public.summary_unlocks FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- The challenge route deletes a legacy empty challenge before regenerating it.
DROP POLICY IF EXISTS "users can delete own paper_challenges" ON public.paper_challenges;
CREATE POLICY "users can delete own paper_challenges"
  ON public.paper_challenges FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
