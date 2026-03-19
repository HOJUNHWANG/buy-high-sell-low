import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Stock, StockPrice, StockPriceHistory, NewsArticle } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";
import { WatchlistButton } from "@/components/WatchlistButton";

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
      .limit(390),
    supabase
      .from("news_articles")
      .select("*")
      .eq("ticker", ticker)
      .order("published_at", { ascending: false })
      .limit(10),
  ]);
  return {
    stock:   stockRes.data as Stock | null,
    price:   priceRes.data as StockPrice | null,
    history: (historyRes.data ?? []) as StockPriceHistory[],
    news:    (newsRes.data ?? []) as NewsArticle[],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const supabase   = await createSupabaseServerClient();
  const { data: stock } = await supabase.from("stocks").select("name").eq("ticker", ticker).single();
  const { data: price } = await supabase.from("stock_prices").select("price, change_pct").eq("ticker", ticker).single();
  if (!stock) return { title: ticker };
  const pctStr = price?.change_pct != null
    ? ` (${price.change_pct >= 0 ? "+" : ""}${price.change_pct.toFixed(2)}%)`
    : "";
  return {
    title:       `${stock.name} (${ticker}) Stock Price & News`,
    description: `${stock.name} stock price $${price?.price ?? "N/A"}${pctStr}. Latest news and AI analysis.`,
    openGraph:   { images: [`/og?ticker=${ticker}`] },
  };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const color = sentiment === "positive" ? "var(--up)" : sentiment === "negative" ? "var(--down)" : "var(--text-3)";
  const bg    = sentiment === "positive" ? "var(--up-dim)" : sentiment === "negative" ? "var(--down-dim)" : "var(--surface-3)";
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: bg, color }}>
      {sentiment}
    </span>
  );
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const { stock, price, history, news } = await getStockData(ticker.toUpperCase());
  if (!stock) notFound();

  const isUp   = (price?.change_pct ?? 0) >= 0;
  const pctStr = price?.change_pct != null
    ? `${price.change_pct >= 0 ? "+" : ""}${price.change_pct.toFixed(2)}%`
    : null;

  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {stock.logo_url && (
                <Image src={stock.logo_url} alt={stock.name} width={40} height={40}
                  className="rounded-xl object-contain bg-white p-0.5 shrink-0" />
              )}
              <div>
                <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                  {stock.name}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {[stock.ticker, stock.exchange, stock.sector].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <WatchlistButton ticker={stock.ticker} />
          </div>

          {/* Price card */}
          {price ? (
            <div className="card rounded-xl p-5">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-4xl font-bold" style={{ color: "var(--text)" }}>
                  ${price.price.toFixed(2)}
                </span>
                {pctStr && (
                  <span className="text-base font-semibold px-2 py-0.5 rounded-lg"
                    style={{
                      color:      isUp ? "var(--up)"     : "var(--down)",
                      background: isUp ? "var(--up-dim)" : "var(--down-dim)",
                    }}>
                    {pctStr}
                  </span>
                )}
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
                {price.volume ? `Vol ${(price.volume / 1_000_000).toFixed(1)}M · ` : ""}
                Delayed · as of{" "}
                {new Date(price.fetched_at).toLocaleTimeString("en-US", {
                  hour: "2-digit", minute: "2-digit", timeZone: "America/New_York",
                })} ET
              </p>
            </div>
          ) : (
            <div className="rounded-xl px-5 py-4 text-sm"
              style={{ border: "1px dashed var(--border-md)", color: "var(--text-2)" }}>
              Price data unavailable
            </div>
          )}

          {/* Chart */}
          <StockChart ticker={ticker} history={history} />

          {/* Affiliate CTA */}
          <div className="card-accent rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Trade {ticker}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                Commission-free with Interactive Brokers
              </p>
            </div>
            <a href="#" target="_blank" rel="noopener noreferrer nofollow"
              className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Open account →
            </a>
          </div>

          {/* Related News */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--text-3)" }}>
              Related News
            </p>

            {news.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-2)" }}>No news for {ticker}.</p>
            ) : (
              <div className="space-y-2">
                {news.map((article) => {
                  const sc     = article.ai_sentiment;
                  const barClr = sc === "positive" ? "var(--up)" : sc === "negative" ? "var(--down)" : "var(--border-md)";
                  return (
                    <article key={article.id} className="card rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-0.5 self-stretch rounded-full shrink-0"
                          style={{ background: barClr }} />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-3)" }}>
                            {article.source && <span>{article.source}</span>}
                            <span>{timeAgo(article.published_at)}</span>
                          </div>
                          <a href={article.url} target="_blank" rel="noopener noreferrer"
                            className="block text-sm font-medium leading-snug external-link"
                            style={{ color: "var(--text)" }}>
                            {article.title}
                          </a>
                          {article.ai_summary && (
                            <div className="rounded-lg p-3 space-y-1.5"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                              <div className="flex gap-1.5">
                                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>AI</span>
                                <SentimentBadge sentiment={sc} />
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                                {article.ai_summary}
                              </p>
                              {article.ai_insight && (
                                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                                  Impact: {article.ai_insight}
                                </p>
                              )}
                              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Not investment advice</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">
          <div className="card rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Overview
            </p>
            {[
              ["Ticker",   stock.ticker],
              ["Exchange", stock.exchange],
              ["Sector",   stock.sector],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string} className="flex justify-between items-start gap-2">
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
                <span className="text-xs font-medium text-right" style={{ color: "var(--text)" }}>{value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
