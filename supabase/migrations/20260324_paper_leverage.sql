-- Add leverage column to paper_transactions
ALTER TABLE paper_transactions
  ADD COLUMN IF NOT EXISTS leverage INT NOT NULL DEFAULT 1;
