-- Cover foreign-key columns used during parent updates/deletes and ticker joins.

CREATE INDEX IF NOT EXISTS idx_paper_challenges_ticker
  ON public.paper_challenges (ticker);
CREATE INDEX IF NOT EXISTS idx_paper_graveyard_user_id
  ON public.paper_graveyard (user_id);
CREATE INDEX IF NOT EXISTS idx_paper_positions_ticker
  ON public.paper_positions (ticker);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_ticker
  ON public.paper_transactions (ticker);
CREATE INDEX IF NOT EXISTS idx_summary_unlocks_article_id
  ON public.summary_unlocks (article_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_ticker
  ON public.watchlist (ticker);
