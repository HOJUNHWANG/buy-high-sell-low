import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Stock, StockPrice, StockPriceHistory, NewsArticle } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";
import { WatchlistButton } from "@/components/WatchlistButton";
import { timeAgo } from "@/lib/utils";
import { SentimentBadge } from "@/components/SentimentBadge";

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
      .order("recorded_at", { ascending: false })  // newest first
      .limit(2500),                                  // ~90 days at 15-min intervals
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
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Trade {ticker}</p>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "var(--surface-3)", color: "var(--text-3)" }}
                >
                  Sponsored
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                Commission-free with Interactive Brokers
              </p>
            </div>
            <a href="https://www.interactivebrokers.com" target="_blank" rel="noopener noreferrer nofollow sponsored"
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

          {/* Overview */}
          <div className="card rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Overview
            </p>
            {([
              ["Ticker",   stock.ticker],
              ["Exchange", stock.exchange],
              ["Sector",   stock.sector],
            ] as [string, string | null][]).filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between items-start gap-2">
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
                <span className="text-xs font-medium text-right" style={{ color: "var(--text)" }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Price stats */}
          {price && (() => {
            const changeDollar = price.change_pct != null
              ? (price.price * price.change_pct) / 100
              : null;
            const prices52w = history.map(h => h.price);
            const high52w   = prices52w.length > 0 ? Math.max(...prices52w) : null;
            const low52w    = prices52w.length > 0 ? Math.min(...prices52w) : null;

            return (
              <div className="card rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                  Price Stats
                </p>
                {changeDollar !== null && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>Change ($)</span>
                    <span className="text-xs font-semibold tabular-nums"
                      style={{ color: changeDollar >= 0 ? "var(--up)" : "var(--down)" }}>
                      {changeDollar >= 0 ? "+" : ""}${Math.abs(changeDollar).toFixed(2)}
                    </span>
                  </div>
                )}
                {price.volume != null && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>Volume</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text)" }}>
                      {price.volume >= 1_000_000
                        ? `${(price.volume / 1_000_000).toFixed(1)}M`
                        : price.volume >= 1_000
                        ? `${(price.volume / 1_000).toFixed(0)}K`
                        : price.volume}
                    </span>
                  </div>
                )}
                {high52w !== null && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>90d High</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: "var(--up)" }}>
                      ${high52w.toFixed(2)}
                    </span>
                  </div>
                )}
                {low52w !== null && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>90d Low</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: "var(--down)" }}>
                      ${low52w.toFixed(2)}
                    </span>
                  </div>
                )}
                {high52w !== null && low52w !== null && high52w > low52w && (
                  <div>
                    <div className="flex justify-between text-[9px] mb-1" style={{ color: "var(--text-3)" }}>
                      <span>L</span><span>90d Range</span><span>H</span>
                    </div>
                    <div className="h-1.5 rounded-full relative" style={{ background: "var(--surface-3)" }}>
                      <div
                        className="absolute h-full rounded-full"
                        style={{
                          left:  `${((low52w - low52w) / (high52w - low52w)) * 100}%`,
                          width: `${((price.price - low52w) / (high52w - low52w)) * 100}%`,
                          background: "var(--accent)",
                          opacity: 0.7,
                        }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2"
                        style={{
                          left: `calc(${((price.price - low52w) / (high52w - low52w)) * 100}% - 5px)`,
                          background: "var(--accent)",
                          borderColor: "var(--bg)",
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-center mt-1" style={{ color: "var(--text-3)" }}>
                      ${price.price.toFixed(2)} current
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Back to screener */}
          <Link
            href="/stocks"
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
            style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All stocks
          </Link>
        </aside>
      </div>
    </div>
  );
}
