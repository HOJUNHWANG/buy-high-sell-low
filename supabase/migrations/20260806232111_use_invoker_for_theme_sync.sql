-- Keep the public theme RPC under caller RLS and remove the definer warning.

GRANT INSERT, UPDATE ON TABLE public.user_preferences TO authenticated;

DROP POLICY IF EXISTS "users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "users can update own preferences" ON public.user_preferences;
CREATE POLICY "users can insert own preferences"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can update own preferences"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)
  SECURITY INVOKER;

DROP POLICY IF EXISTS "users can read own paper_challenges" ON public.paper_challenges;
CREATE POLICY "users can read own paper_challenges"
  ON public.paper_challenges FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
