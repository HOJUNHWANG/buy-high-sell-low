-- Synchronize theme writes atomically and keep table privileges least-privilege.

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_preferences FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_preferences TO authenticated;
DROP POLICY IF EXISTS "users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "users can update own preferences" ON public.user_preferences;

CREATE OR REPLACE FUNCTION public.set_theme_preference(
  p_theme TEXT,
  p_updated_at TIMESTAMPTZ,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(theme TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_received_at TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_candidate_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_updated_at IS NULL THEN
    RAISE EXCEPTION 'updated_at is required' USING ERRCODE = '22023';
  END IF;

  -- A bad client clock must never create a future timestamp that blocks every
  -- other device. Explicit user selections can force last-arrival semantics;
  -- background reconciliation only replaces an older stored preference.
  v_candidate_at := LEAST(
    p_updated_at,
    v_received_at + INTERVAL '5 minutes'
  );

  INSERT INTO public.user_preferences AS preference (user_id, theme, updated_at)
  VALUES (v_user_id, p_theme, v_received_at)
  ON CONFLICT (user_id) DO UPDATE
    SET theme = EXCLUDED.theme,
        updated_at = v_received_at
    WHERE COALESCE(p_force, FALSE)
       OR preference.updated_at <= v_candidate_at;

  RETURN QUERY
    SELECT preference.theme, preference.updated_at
    FROM public.user_preferences AS preference
    WHERE preference.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)
  TO authenticated;
