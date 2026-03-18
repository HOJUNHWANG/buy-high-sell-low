import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Stock, StockPrice, StockPriceHistory, NewsArticle } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";

interface Props {
  params: Promise<{ ticker: string }>;
}

async function getStockData(ticker: string) {
  const supabase = await createSupabaseServerClient();

  const [stockRes, priceRes, historyRes, newsRes] = await Promise.all([
    supabase.from("stocks").select("*").eq("ticker", ticker).single(),
    supabase.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabase
      .from("stock_price_history")
      .select("price, recorded_at")
      .eq("ticker", ticker)
      .order("recorded_at", { ascending: true })
      .limit(390), // ~1D full resolution
    supabase
      .from("news_articles")
      .select("*")
      .eq("ticker", ticker)
      .order("published_at", { ascending: false })
      .limit(10),
  ]);

  return {
    stock: stockRes.data as Stock | null,
    price: priceRes.data as StockPrice | null,
    history: (historyRes.data ?? []) as StockPriceHistory[],
    news: (newsRes.data ?? []) as NewsArticle[],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: stock } = await supabase
    .from("stocks")
    .select("name")
    .eq("ticker", ticker)
    .single();
  const { data: price } = await supabase
    .from("stock_prices")
    .select("price, change_pct")
    .eq("ticker", ticker)
    .single();

  if (!stock) return { title: ticker };

  const pctStr =
    price?.change_pct != null
      ? ` (${price.change_pct >= 0 ? "+" : ""}${price.change_pct.toFixed(2)}%)`
      : "";

  return {
    title: `${stock.name} (${ticker}) Stock Price & News`,
    description: `${stock.name} stock price $${price?.price ?? "N/A"}${pctStr}. Latest news and AI analysis.`,
    openGraph: {
      images: [`/og?ticker=${ticker}`],
    },
  };
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

function formatChangePct(pct: number | null) {
  if (pct === null) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatVolume(vol: number | null) {
  if (!vol) return null;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const { stock, price, history, news } = await getStockData(ticker.toUpperCase());

  if (!stock) notFound();

  const isUp = (price?.change_pct ?? 0) >= 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            {stock.logo_url && (
              <Image
                src={stock.logo_url}
                alt={stock.name}
                width={48}
                height={48}
                className="rounded-lg object-contain bg-white p-1"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{stock.name}</h1>
              <p className="text-sm text-gray-400">
                {stock.exchange}
                {stock.sector && ` · ${stock.sector}`}
              </p>
            </div>
          </div>

          {/* Price */}
          {price ? (
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-white">
                  {formatPrice(price.price)}
                </span>
                {price.change_pct !== null && (
                  <span
                    className={`text-xl font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {formatChangePct(price.change_pct)}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {price.volume && `Vol ${formatVolume(price.volume)} · `}
                Delayed · as of{" "}
                {new Date(price.fetched_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                })}{" "}
                ET
              </p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Price data unavailable.</p>
          )}

          {/* Chart */}
          <StockChart ticker={ticker} history={history} />

          {/* Affiliate CTA */}
          <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white text-sm">Trade {ticker}</p>
              <p className="text-xs text-blue-300">
                Commission-free with Interactive Brokers
              </p>
            </div>
            <a
              href="#"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open account →
            </a>
          </div>

          {/* Related News */}
          <section>
            <h2 className="text-lg font-semibold text-gray-300 mb-4">
              Related News
            </h2>
            {news.length === 0 ? (
              <p className="text-gray-500 text-sm">No news found for {ticker}.</p>
            ) : (
              <div className="space-y-4">
                {news.map((article) => (
                  <article
                    key={article.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {article.source && <span>{article.source}</span>}
                      <span>{timeAgo(article.published_at)}</span>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-medium text-gray-100 hover:text-white leading-snug"
                    >
                      {article.title}
                    </a>

                    {article.ai_summary && (
                      <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300 space-y-1">
                        <p>{article.ai_summary}</p>
                        {article.ai_insight && (
                          <p className="text-gray-400 italic text-xs">
                            Impact: {article.ai_insight}
                          </p>
                        )}
                        {article.ai_sentiment && (
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                              article.ai_sentiment === "positive"
                                ? "bg-emerald-900 text-emerald-300"
                                : article.ai_sentiment === "negative"
                                ? "bg-red-900 text-red-300"
                                : "bg-gray-700 text-gray-300"
                            }`}
                          >
                            {article.ai_sentiment}
                          </span>
                        )}
                        <p className="text-xs text-gray-500">
                          ⚠ Not investment advice.
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Sidebar */}
        <aside className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              About
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Ticker</span>
                <span className="text-white font-medium">{stock.ticker}</span>
              </div>
              {stock.exchange && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Exchange</span>
                  <span className="text-white">{stock.exchange}</span>
                </div>
              )}
              {stock.sector && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Sector</span>
                  <span className="text-white text-right max-w-32">{stock.sector}</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
