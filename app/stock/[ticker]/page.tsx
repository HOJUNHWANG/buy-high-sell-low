import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Stock, StockPrice, StockPriceHistory, NewsArticle, AffiliateLink } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";
import { WatchlistButton } from "@/components/WatchlistButton";
import { AdSlot } from "@/components/AdSlot";
import { BookRecommendation } from "@/components/BookRecommendation";
import { StockNewsSection } from "@/components/StockNewsSection";
import { gateSummaries, FREE_USER_DAILY_UNLOCKS } from "@/lib/summary-gate";
import type { UserTier } from "@/lib/summary-gate";

interface Props {
  params: Promise<{ ticker: string }>;
}

async function getStockData(ticker: string) {
  const supabase = await createSupabaseServerClient();
  const [stockRes, priceRes, historyRes, newsRes, affiliateRes] = await Promise.all([
    supabase.from("stocks").select("*").eq("ticker", ticker).single(),
    supabase.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabase
      .from("stock_price_history")
      .select("price, recorded_at")
      .eq("ticker", ticker)
      .gte("recorded_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order("recorded_at", { ascending: false }),  // newest first, no row cap
    supabase
      .from("news_articles")
      .select("*")
      .eq("ticker", ticker)
      .order("published_at", { ascending: false })
      .limit(10),
    supabase
      .from("affiliate_links")
      .select("*")
      .eq("placement", "stock_detail")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const news = (newsRes.data ?? []) as NewsArticle[];

  return {
    stock:     stockRes.data as Stock | null,
    price:     priceRes.data as StockPrice | null,
    history:   (historyRes.data ?? []) as StockPriceHistory[],
    news,
    affiliate: affiliateRes.data as AffiliateLink | null,
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
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { stock, price, history, news: rawNews, affiliate } = await getStockData(ticker.toUpperCase());
  if (!stock) notFound();

  // Summary gating
  let tier: UserTier = "guest";
  let unlockedIds = new Set<number>();
  let remainingUnlocks = 0;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("tier")
      .eq("user_id", user.id)
      .single();
    tier = (profile?.tier as UserTier) ?? "free";

    const { data: unlocks } = await supabase
      .from("summary_unlocks")
      .select("article_id, unlocked_at")
      .eq("user_id", user.id);
    unlockedIds = new Set((unlocks ?? []).map((u: { article_id: number }) => u.article_id));

    if (tier === "free") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = (unlocks ?? []).filter(
        (u: { unlocked_at: string }) => new Date(u.unlocked_at) >= todayStart,
      ).length;
      remainingUnlocks = Math.max(0, FREE_USER_DAILY_UNLOCKS - todayCount);
    }
  }

  const news = gateSummaries(rawNews, tier, unlockedIds);

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
          <StockChart
            ticker={ticker}
            history={history}
            isCrypto={stock.sector === "Cryptocurrency"}
            currentPrice={price ? { price: price.price, fetched_at: price.fetched_at } : null}
          />

          {/* Ad: below chart */}
          <AdSlot slot="stock-below-chart" format="horizontal" />

          {/* Affiliate CTA (from DB) */}
          {affiliate && affiliate.url && (
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
                  {affiliate.label}
                </p>
              </div>
              <a href={affiliate.url} target="_blank" rel="noopener noreferrer nofollow sponsored"
                className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Open account →
              </a>
            </div>
          )}

          {/* Related News */}
          <StockNewsSection
            news={news}
            ticker={ticker}
            isLoggedIn={!!user}
            initialRemainingUnlocks={remainingUnlocks}
          />
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
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>1Y High</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: "var(--up)" }}>
                      ${high52w.toFixed(2)}
                    </span>
                  </div>
                )}
                {low52w !== null && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>1Y Low</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: "var(--down)" }}>
                      ${low52w.toFixed(2)}
                    </span>
                  </div>
                )}
                {high52w !== null && low52w !== null && high52w > low52w && (
                  <div>
                    <div className="flex justify-between text-[9px] mb-1" style={{ color: "var(--text-3)" }}>
                      <span>L</span><span>1Y Range</span><span>H</span>
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

          {/* Ad: sidebar rectangle */}
          <AdSlot slot="stock-sidebar" format="rectangle" />

          {/* Paper Trade CTA — not available for ETFs */}
          {stock.sector === "ETF" ? (
            <div
              className="text-[11px] text-center px-3 py-2.5 rounded-lg"
              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              ETFs are view-only — paper trading and What If are not available for ETFs.
            </div>
          ) : (
            <Link
              href={`/paper/trade/${stock.ticker}`}
              className="flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Paper Trade {stock.ticker}
            </Link>
          )}

          {/* Book recommendations */}
          <BookRecommendation />

          {/* Back to screener */}
          <Link
            href={stock.sector === "Cryptocurrency" ? "/stocks?tab=crypto" : stock.sector === "ETF" ? "/stocks?tab=etf" : "/stocks"}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
            style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {stock.sector === "Cryptocurrency" ? "All crypto" : stock.sector === "ETF" ? "All ETFs" : "All stocks"}
          </Link>
        </aside>
      </div>
    </div>
  );
}
