export interface Stock {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  logo_url: string | null;
  market_cap: number | null;
  updated_at: string;
}

export interface StockPrice {
  ticker: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
  fetched_at: string;
}

export interface StockPriceHistory {
  id: number;
  ticker: string;
  price: number;
  recorded_at: string;
}

export interface NewsArticle {
  id: number;
  ticker: string | null;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  ai_summary: string | null;
  ai_insight: string | null;
  ai_sentiment: "positive" | "neutral" | "negative" | null;
  ai_caution: string | null;
  ai_generated_at: string | null;
  fetched_at: string;
  /** Client-side flag: true when AI summary is gated for this user's tier */
  summaryLocked?: boolean;
}

export interface WatchlistItem {
  id: number;
  user_id: string;
  ticker: string;
  created_at: string;
}

export interface AffiliateLink {
  id: number;
  partner: string;
  label: string;
  url: string;
  cpa_usd: number | null;
  placement: string | null;
  is_active: boolean;
}

export interface StockWithPrice extends Stock {
  price?: StockPrice;
}

// 20-year daily OHLCV for What If feature
export interface PriceHistoryLong {
  id: number;
  ticker: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

// What If scenarios
export interface WhatIfScenario {
  id: number;
  user_id: string;
  ticker: string;
  buy_date: string;
  sell_date: string | null;
  amount_usd: number;
  created_at: string;
}

// Paper Trading
export interface PaperAccount {
  user_id: string;
  cash_balance: number;
  status: "active" | "margin_call" | "liquidated" | "suspended";
  margin_call_at: string | null;
  liquidation_count: number;
  last_liquidation_at: string | null;
  suspended_until: string | null;
  last_checkin: string | null;
  streak: number;
  created_at: string;
}

export interface PaperChallenge {
  id: number;
  user_id: string;
  ticker: string;
  challenge_type: "gain_pct" | "hold_value";
  target_pct: number;
  week_start: string;
  week_end: string;
  entry_price: number | null;
  status: "active" | "completed" | "failed" | "expired";
  reward_usd: number;
  created_at: string;
}

export interface PaperPosition {
  id: number;
  user_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  leverage: number;
  borrowed: number;
  created_at: string;
  updated_at: string;
}

export interface PaperTransaction {
  id: number;
  user_id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  leverage: number;
  executed_at: string;
}

export interface PaperAchievement {
  id: number;
  user_id: string;
  badge_key: string;
  earned_at: string;
}
