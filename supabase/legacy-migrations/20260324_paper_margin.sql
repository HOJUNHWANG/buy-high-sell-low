-- Add margin/leverage columns to paper_positions
ALTER TABLE paper_positions
  ADD COLUMN IF NOT EXISTS leverage INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS borrowed NUMERIC NOT NULL DEFAULT 0;
