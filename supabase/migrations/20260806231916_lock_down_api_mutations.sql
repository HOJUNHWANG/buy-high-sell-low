-- Keep quota and game-state mutations behind authenticated server routes.

ALTER TABLE public.ai_why_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_why_usage FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_why_usage TO authenticated;
DROP POLICY IF EXISTS "users can insert own ai why usage" ON public.ai_why_usage;
DROP POLICY IF EXISTS "users can delete own ai why usage" ON public.ai_why_usage;

ALTER TABLE public.summary_unlocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.summary_unlocks FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.summary_unlocks_id_seq FROM anon, authenticated;
GRANT SELECT ON TABLE public.summary_unlocks TO authenticated;
DROP POLICY IF EXISTS "users can insert own summary_unlocks" ON public.summary_unlocks;

ALTER TABLE public.paper_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paper_challenges FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.paper_challenges_id_seq FROM anon, authenticated;
GRANT SELECT ON TABLE public.paper_challenges TO authenticated;
DROP POLICY IF EXISTS "users can insert own paper_challenges" ON public.paper_challenges;
DROP POLICY IF EXISTS "users can update own paper_challenges" ON public.paper_challenges;
DROP POLICY IF EXISTS "users can delete own paper_challenges" ON public.paper_challenges;

CREATE OR REPLACE FUNCTION public.claim_summary_unlock(
  p_user_id UUID,
  p_article_id BIGINT,
  p_daily_limit INTEGER
)
RETURNS TABLE(outcome TEXT, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_premium BOOLEAN;
  v_today_count INTEGER := 0;
  v_day_start TIMESTAMPTZ :=
    pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')
    AT TIME ZONE 'UTC';
BEGIN
  IF p_user_id IS NULL OR p_article_id IS NULL OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'invalid summary unlock claim' USING ERRCODE = '22023';
  END IF;

  -- Serialize different-article claims for the same user and UTC day so the
  -- count check and insert cannot overshoot the free quota concurrently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::TEXT || ':' || v_day_start::DATE::TEXT,
      0
    )
  );

  SELECT COALESCE(
    (SELECT profile.tier = 'premium'
     FROM public.user_profiles AS profile
     WHERE profile.user_id = p_user_id),
    FALSE
  )
  INTO v_is_premium;

  IF NOT v_is_premium THEN
    SELECT COUNT(*)::INTEGER
    INTO v_today_count
    FROM public.summary_unlocks AS unlock
    WHERE unlock.user_id = p_user_id
      AND unlock.unlocked_at >= v_day_start;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.summary_unlocks AS unlock
    WHERE unlock.user_id = p_user_id
      AND unlock.article_id = p_article_id
  ) THEN
    RETURN QUERY SELECT
      'already_unlocked'::TEXT,
      CASE WHEN v_is_premium THEN NULL::INTEGER
           ELSE GREATEST(p_daily_limit - v_today_count, 0)
      END;
    RETURN;
  END IF;

  IF NOT v_is_premium AND v_today_count >= p_daily_limit THEN
    RETURN QUERY SELECT 'limit_reached'::TEXT, 0::INTEGER;
    RETURN;
  END IF;

  INSERT INTO public.summary_unlocks (user_id, article_id)
  VALUES (p_user_id, p_article_id)
  ON CONFLICT (user_id, article_id) DO NOTHING;

  RETURN QUERY SELECT
    'unlocked'::TEXT,
    CASE WHEN v_is_premium THEN NULL::INTEGER
         ELSE GREATEST(p_daily_limit - v_today_count - 1, 0)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_summary_unlock(UUID, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_summary_unlock(UUID, BIGINT, INTEGER)
  TO service_role;
