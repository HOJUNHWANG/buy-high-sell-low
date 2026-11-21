import { cache } from "react";
import { cachePublicData } from "@/lib/public-data-cache";
import { createPublicMarketClient } from "@/lib/supabase/public";
import type { StockPrice, Stock, NewsArticle, StockPriceHistory } from "@/lib/types";
import { getLatestCompletedTradingDate, isCrypto } from "@/lib/market-hours";
import stockSplits from "@/data/stock-splits.json";

export type StockPriceWithStock = StockPrice & { stocks: Stock };

export type MarketStock = Stock & { stock_prices: StockPrice | null };

const DAY_MS = 86_400_000;
const HISTORY_PAGE_SIZE = 1000;
const EXTREME_EQUITY_CHANGE_PCT = 40;
const easternDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York",
  dateStyle: "short",
});

// Cache public data, not rendered pages or user-specific gated summaries.
// Throw on failures so an outage cannot replace a good snapshot with [].
export const getMarketSnapshot = cachePublicData(async (): Promise<MarketStock[]> => {
  const supabase = createPublicMarketClient();
  const { data, error } = await supabase.from("stocks")
    .select("*, stock_prices(*)").order("ticker");
  if (error) throw new Error("Market snapshot unavailable");
  const stocks = (data ?? []) as MarketStock[];

  // Recover a split-day change suppressed by a worker that used a pre-split close.
  for (const { ticker, marketDate, ratio } of stockSplits) {
    const quote = stocks.find(stock => stock.ticker === ticker)?.stock_prices;
    if (quote?.provider_session_date !== marketDate || quote.change_pct !== null) continue;

    const priorDate = getLatestCompletedTradingDate(new Date(`${marketDate}T12:00:00Z`));
    const { data: prior } = await supabase.from("price_history_long").select("close,price_basis")
      .eq("ticker", ticker).eq("date", priorDate).maybeSingle();
    if (!prior || prior.close <= 0) continue;

    const close = prior.price_basis === "split_adjusted" ? prior.close : prior.close / ratio;
    const change = ((quote.price - close) / close) * 100;
    if (Math.abs(change) < EXTREME_EQUITY_CHANGE_PCT) quote.change_pct = change;
  }
  return stocks;
}, ["market-snapshot-v3"], { revalidate: 60, tags: ["public-market"] });

export const getAllStockPrices = cache(async (): Promise<StockPriceWithStock[]> => {
  return (await getMarketSnapshot()).flatMap(({ stock_prices, ...stock }) =>
    stock_prices && stock.is_active !== false ? [{ ...stock_prices, stocks: stock }] : []);
});

export const getLatestPublicNews = cachePublicData(async (): Promise<NewsArticle[]> => {
  const { data, error } = await createPublicMarketClient().from("news_articles").select("*")
    .gte("relevance_score", 35)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(240);
  if (error) throw new Error("News unavailable");
  return (data ?? []) as NewsArticle[];
}, ["public-news-v2"], { revalidate: 60, tags: ["public-news"] });

export type RecentNewsSignal = Pick<NewsArticle, "id" | "related_tickers" | "ai_sentiment" | "event_key" | "summary_method" | "published_at">;
export const getRecentNewsSignals = cachePublicData(async (): Promise<RecentNewsSignal[]> => {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await createPublicMarketClient().from("news_articles")
    .select("id,related_tickers,ai_sentiment,event_key,summary_method,published_at")
    .gte("published_at", since).gte("quality_version", 2).gte("relevance_score", 35)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(1000);
  if (error) throw new Error("News signals unavailable");
  return (data ?? []) as RecentNewsSignal[];
}, ["recent-news-signals-v2"], { revalidate: 60, tags: ["public-news"] });

export const getScreenerHistory = cachePublicData(async () => {
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
}, ["screener-history-v2"], { revalidate: 300, tags: ["public-market"] });

export const getStockHistory = cachePublicData(async (ticker: string): Promise<StockPriceHistory[]> => {
  const supabase = createPublicMarketClient();
  const now = Date.now();
  const intradayQuery = (start: number) => supabase.from("stock_price_history")
    .select("price,recorded_at").eq("ticker", ticker).gte("recorded_at", new Date(start).toISOString())
    .order("recorded_at", { ascending: false }).limit(HISTORY_PAGE_SIZE);

  const [intraday, daily] = await Promise.all([
    intradayQuery(now - 30 * DAY_MS),
    supabase.from("price_history_long").select("close,date,price_basis").eq("ticker", ticker)
      .gte("date", new Date(now - 366 * DAY_MS).toISOString().slice(0, 10)).order("date", { ascending: false }),
  ]);
  if (intraday.error || daily.error) throw new Error("Chart history unavailable");

  let page = intraday.data ?? [];
  const recent = [...page];
  const weekStart = now - 7 * DAY_MS;
  // A week of 24/7 quotes can exceed the API's 1,000-row response limit.
  while (page.length === HISTORY_PAGE_SIZE) {
    const before = page[page.length - 1].recorded_at;
    if (Date.parse(before) <= weekStart) break;
    const next = await intradayQuery(weekStart).lt("recorded_at", before);
    if (next.error) throw new Error("Chart history unavailable");
    page = next.data ?? [];
    recent.push(...page);
  }

  const crypto = isCrypto(ticker);
  const sessionDate = (timestamp: string) => crypto ? timestamp.slice(0, 10) : easternDate.format(new Date(timestamp));
  const oldestDay = recent.length ? sessionDate(recent[recent.length - 1].recorded_at) : null;
  const dailyRows = daily.data ?? [];
  const latestIntradayDay = recent.length ? sessionDate(recent[0].recorded_at) : "";
  const splits = stockSplits.filter(split => split.ticker === ticker &&
    (split.marketDate <= latestIntradayDay || split.marketDate <= (dailyRows[0]?.date ?? "")));
  const adjust = (price: number, date: string) => splits.reduce(
    (value, split) => date < split.marketDate ? value / split.ratio : value, price,
  );

  const prior = dailyRows.filter(row => !oldestDay || row.date < oldestDay).map(row => ({
    price: row.price_basis === "split_adjusted" ? row.close : adjust(row.close, row.date),
    recorded_at: row.date,
  }));
  const intradayPoints = splits.length ? recent.map(point => ({
    ...point,
    price: adjust(point.price, sessionDate(point.recorded_at)),
  })) : recent;
  return [...intradayPoints, ...prior].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)) as StockPriceHistory[];
}, ["stock-history-v3"], { revalidate: 60, tags: ["public-market"] });

export const getTickerNews = cachePublicData(async (ticker: string): Promise<NewsArticle[]> => {
  const { data, error } = await createPublicMarketClient().from("news_articles").select("*")
    .contains("related_tickers", [ticker]).gte("quality_version", 2)
    .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(10);
  if (error) throw new Error("Ticker news unavailable");
  return (data ?? []) as NewsArticle[];
}, ["ticker-news-v2"], { revalidate: 60, tags: ["public-news"] });
