export interface Stock {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  logo_url: string | null;
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
