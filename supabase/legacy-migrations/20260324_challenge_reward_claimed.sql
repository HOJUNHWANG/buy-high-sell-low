-- Add reward_claimed flag to paper_challenges
-- Rewards are no longer auto-paid; user must click "Claim Reward" button.
-- Unclaimed rewards expire when the next week's challenge starts (Monday).
ALTER TABLE paper_challenges
  ADD COLUMN IF NOT EXISTS reward_claimed BOOLEAN DEFAULT FALSE;
