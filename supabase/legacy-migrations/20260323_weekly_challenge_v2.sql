-- Weekly Challenge v2: Prediction-based (5 random stocks, up/down per user)
-- picks: JSONB array of {ticker, direction, base_price, final_price, correct}

-- Add picks column (JSONB array of 5 predictions)
ALTER TABLE paper_challenges ADD COLUMN IF NOT EXISTS picks JSONB;

-- Allow null ticker (legacy) and target_pct (legacy) for new prediction challenges
ALTER TABLE paper_challenges ALTER COLUMN ticker DROP NOT NULL;
ALTER TABLE paper_challenges ALTER COLUMN target_pct DROP DEFAULT;

-- Drop old check constraint and add new challenge_type
ALTER TABLE paper_challenges DROP CONSTRAINT IF EXISTS paper_challenges_challenge_type_check;
ALTER TABLE paper_challenges ADD CONSTRAINT paper_challenges_challenge_type_check
  CHECK (challenge_type IN ('gain_pct', 'hold_value', 'prediction'));

-- Add submitted flag (user submits predictions before Friday close)
ALTER TABLE paper_challenges ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Update status check to include 'pending' (submitted but not yet resolved)
ALTER TABLE paper_challenges DROP CONSTRAINT IF EXISTS paper_challenges_status_check;
ALTER TABLE paper_challenges ADD CONSTRAINT paper_challenges_status_check
  CHECK (status IN ('active', 'pending', 'completed', 'failed', 'expired'));
