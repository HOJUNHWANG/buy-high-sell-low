import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicMarketClient } from "@/lib/supabase/public";
import type { StockPrice, Stock, NewsArticle, StockPriceHistory } from "@/lib/types";

export type StockPriceWithStock = StockPrice & { stocks: Stock };

export type MarketStock = Stock & { stock_prices: StockPrice | null };

// Cache public data, not rendered pages or user-specific gated summaries.
// Throw on failures so an outage cannot replace a good snapshot with [].
export const getMarketSnapshot = cache(unstable_cache(async (): Promise<MarketStock[]> => {
  const { data, error } = await createPublicMarketClient().from("stocks")
    .select("*, stock_prices(*)").order("ticker");
  if (error) throw new Error("Market snapshot unavailable");
  return (data ?? []) as MarketStock[];
}, ["market-snapshot-v1"], { revalidate: 60, tags: ["public-market"] }));

export const getAllStockPrices = cache(async (): Promise<StockPriceWithStock[]> => {
  return (await getMarketSnapshot()).flatMap(({ stock_prices, ...stock }) =>
    stock_prices && stock.is_active !== false ? [{ ...stock_prices, stocks: stock }] : []);
});

export const getLatestPublicNews = cache(unstable_cache(async (): Promise<NewsArticle[]> => {
  const { data, error } = await createPublicMarketClient().from("news_articles").select("*")
    .gte("relevance_score", 35)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(240);
  if (error) throw new Error("News unavailable");
  return (data ?? []) as NewsArticle[];
}, ["public-news-v1"], { revalidate: 60, tags: ["public-news"] }));

export type RecentNewsSignal = Pick<NewsArticle, "id" | "related_tickers" | "ai_sentiment" | "event_key" | "summary_method" | "published_at">;
export const getRecentNewsSignals = cache(unstable_cache(async (): Promise<RecentNewsSignal[]> => {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await createPublicMarketClient().from("news_articles")
    .select("id,related_tickers,ai_sentiment,event_key,summary_method,published_at")
    .gte("published_at", since).gte("quality_version", 2).gte("relevance_score", 35)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(1000);
  if (error) throw new Error("News signals unavailable");
  return (data ?? []) as RecentNewsSignal[];
}, ["recent-news-signals-v1"], { revalidate: 60, tags: ["public-news"] }));

export const getScreenerHistory = cache(unstable_cache(async () => {
  const supabase = createPublicMarketClient();
  const now = new Date();
  const target = now.getTime() - 30 * 86_400_000;
  const yearAgo = new Date(now); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const [history, leaders] = await Promise.all([
    supabase.from("price_history_long").select("ticker,close,date")
      .gte("date", new Date(target - 3 * 86_400_000).toISOString().slice(0, 10))
      .lte("date", new Date(target + 3 * 86_400_000).toISOString().slice(0, 10)),
    supabase.from("market_cap_daily_leaders").select("ticker,date,asset_type")
      .gte("date", yearAgo.toISOString().slice(0, 10)).order("date", { ascending: false }),
  ]);
  if (history.error || leaders.error) throw new Error("Screener history unavailable");
  return { history: history.data ?? [], leaders: leaders.data ?? [] };
}, ["screener-history-v1"], { revalidate: 300, tags: ["public-market"] }));

export const getStockHistory = cache(unstable_cache(async (ticker: string): Promise<StockPriceHistory[]> => {
  const supabase = createPublicMarketClient();
  const now = Date.now();
  const [intraday, daily] = await Promise.all([
    supabase.from("stock_price_history").select("price,recorded_at").eq("ticker", ticker)
      .gte("recorded_at", new Date(now - 30 * 86_400_000).toISOString()).order("recorded_at", { ascending: false }),
    supabase.from("price_history_long").select("close,date").eq("ticker", ticker)
      .gte("date", new Date(now - 366 * 86_400_000).toISOString().slice(0, 10)).order("date", { ascending: false }),
  ]);
  if (intraday.error || daily.error) throw new Error("Chart history unavailable");
  const recent = intraday.data ?? [];
  const oldest = recent.length ? Date.parse(recent[recent.length - 1].recorded_at) : now;
  const prior = (daily.data ?? []).filter(row => Date.parse(row.date) < oldest)
    .map(row => ({ price: row.close, recorded_at: row.date }));
  return [...recent, ...prior].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)) as StockPriceHistory[];
}, ["stock-history-v1"], { revalidate: 60, tags: ["public-market"] }));

export const getTickerNews = cache(unstable_cache(async (ticker: string): Promise<NewsArticle[]> => {
  const { data, error } = await createPublicMarketClient().from("news_articles").select("*")
    .contains("related_tickers", [ticker]).gte("quality_version", 2)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(10);
  if (error) throw new Error("Ticker news unavailable");
  return (data ?? []) as NewsArticle[];
}, ["ticker-news-v1"], { revalidate: 60, tags: ["public-news"] }));
