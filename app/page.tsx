import { HomeNewsCard } from "@/components/HomeNewsCard";
import { getNewsAccess } from "@/lib/news-access";
import type { StockPrice, Stock } from "@/lib/types";
import { formatAssetPrice } from "@/lib/price-format";
import { PriceFreshnessBadge } from "@/components/PriceFreshnessBadge";
import Link from "next/link";
import { LogoImage } from "@/components/LogoImage";
import { Suspense } from "react";
import { WatchlistSection } from "@/components/WatchlistSection";
import { MarketStatusWidget } from "@/components/MarketStatusWidget";
import { MarketClosedBanner } from "@/components/MarketClosedBanner";
import { SectorWidget } from "@/components/SectorWidget";
import { MarketStatsWidget } from "@/components/MarketStatsWidget";
import { SentimentWidget } from "@/components/SentimentWidget";
import { gateSummaries } from "@/lib/summary-gate";
import { getAllStockPrices, getLatestPublicNews } from "@/lib/cached-data";
import { getMarketStatus } from "@/lib/market-hours";
import { MarketOverview } from "@/components/MarketOverview";

async function getMovers(): Promise<{
  stockGainers: (StockPrice & { stocks: Stock })[];
  stockLosers:  (StockPrice & { stocks: Stock })[];
  cryptoGainers: (StockPrice & { stocks: Stock })[];
  cryptoLosers:  (StockPrice & { stocks: Stock })[];
}> {
  try {
    const all = (await getAllStockPrices()).filter((s) => s.change_pct != null);

    const stocks = all.filter((s) => !s.ticker.includes("-USD"));
    const crypto = all.filter((s) => s.ticker.includes("-USD"));

    const sortedStocks = [...stocks].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
    const sortedCrypto = [...crypto].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));

    return {
      stockGainers: sortedStocks.slice(0, 5),
      stockLosers:  sortedStocks.slice(-5).reverse(),
      cryptoGainers: sortedCrypto.slice(0, 5),
      cryptoLosers:  sortedCrypto.slice(-5).reverse(),
    };
  } catch {
    return { stockGainers: [], stockLosers: [], cryptoGainers: [], cryptoLosers: [] };
  }
}

function SidebarSkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-4 w-16 rounded" />
      <div className="skeleton h-3 w-28 rounded" />
    </div>
  );
}

export default async function HomePage() {
  const [movers, articles, access] = await Promise.all([
    getMovers(), getLatestPublicNews().catch(() => []), getNewsAccess(),
  ]);
  const { user, tier, unlockedIds } = access;
  const { stockGainers, stockLosers, cryptoGainers, cryptoLosers } = movers;
  const news = gateSummaries(articles.slice(0, user ? 20 : 6), tier, unlockedIds);
  const marketStatus = getMarketStatus();
  const moverGroups = marketStatus.isOpen
    ? [
        { label: "Stocks", gainers: stockGainers, losers: stockLosers, live: false },
        { label: "Crypto", gainers: cryptoGainers, losers: cryptoLosers, live: true },
      ]
    : [
        { label: "Crypto", gainers: cryptoGainers, losers: cryptoLosers, live: true },
        { label: "Last completed stock session", gainers: stockGainers, losers: stockLosers, live: false },
      ];

  return (
    <div className="home-page">
      {/* ── Landing hero (guest only) ── */}
      {!user && (
        <div className="classic-home-hero hero-gradient relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-5 pt-24 pb-20 text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 text-[11px] font-semibold uppercase tracking-wider scale-in"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(124,108,252,0.2)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Market-aware data
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-5 max-w-3xl mx-auto tracking-tight fade-up">
              <span className="gradient-text">Track. Analyze.</span>
              <br />
              <span style={{ color: "var(--text)" }}>Paper Trade.</span>
            </h1>

            <p
              className="text-sm sm:text-lg max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2 sm:px-0"
              style={{ color: "var(--text-2)" }}
            >
              Market-aware S&amp;P 100 &amp; 24/7 crypto quotes, AI-powered news analysis,
              and a full paper trading simulator — completely free.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 stagger px-4 sm:px-0">
              <Link href="/auth/login" className="btn btn-primary btn-xl w-full sm:w-auto">
                Get started free
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link href="#markets" className="btn btn-secondary btn-xl w-full sm:w-auto">
                View markets
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 mt-14 stagger">
              {[
                { label: "S&P 100 + Crypto" },
                { label: "AI News Analysis" },
                { label: "Paper Trading" },
              ].map(({ label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3-column layout ── */}
      <div className="home-markets max-w-7xl mx-auto px-5 py-8" id="markets">

        {/* Page title — always visible */}
        <div className="home-markets-title mb-8">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Markets
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            Market-aware prices &amp; AI-powered news
          </p>
        </div>

        <MarketClosedBanner />

        <div className="home-layout flex gap-5 items-start">
          <Suspense fallback={<div className="market-overview design-v2-only"><div className="skeleton h-64" /></div>}><MarketOverview /></Suspense>

          {/* ── Main content ── */}
          <div className="home-feed flex-1 min-w-0">

            {/* Watchlist (logged-in only) */}
            {user && (
              <Suspense fallback={
                <section className="mb-8">
                  <div className="skeleton h-3 w-20 rounded mb-3" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton rounded-xl h-[72px]" />
                    ))}
                  </div>
                </section>
              }>
                <WatchlistSection userId={user.id} />
              </Suspense>
            )}

            {/* Movers */}
            <section className="home-movers mb-10">
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-3)" }}
                >
                  {marketStatus.isOpen ? "Today’s Movers" : "Market activity"}
                </p>
                <Link href="/stocks" className="nav-link text-xs">
                  All stocks →
                </Link>
              </div>

              {stockGainers.length === 0 && cryptoGainers.length === 0 ? (
                <div
                  className="card rounded-xl px-5 py-8 text-sm text-center"
                  style={{ color: "var(--text-2)" }}
                >
                  Market data unavailable — updates during trading hours (9:30 AM – 4:00 PM ET)
                </div>
              ) : (
                <div className="home-mover-groups space-y-6">
                  {moverGroups.map((group) => (
                    group.gainers.length > 0 && (
                      <MoverGroup key={group.label} {...group} />
                    )
                  ))}
                </div>
              )}
            </section>

            {/* News */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-3)" }}
                >
                  {user ? "Latest News" : "News Preview"}
                </p>
                <Link href="/news" className="nav-link text-xs">
                  View all →
                </Link>
              </div>

              {news.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  No news yet.
                </p>
              ) : (
                <div className="home-news-grid space-y-2">
                  {news.map((article) => (
                    <HomeNewsCard key={article.id} article={article} isLoggedIn={!!user} />
                  ))}
                </div>
              )}

              {!user && news.length > 0 && (
                <div
                  className="mt-6 card-accent rounded-xl p-6 text-center"
                >
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>
                    Unlock full access
                  </p>
                  <p className="text-xs mb-4" style={{ color: "var(--text-2)" }}>
                    AI summaries, paper trading, watchlist &amp; more — completely free.
                  </p>
                  <Link href="/auth/login" className="btn btn-primary btn-sm">
                    Create free account
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              )}
            </section>
          </div>

          <div className="home-sidebar">
            {/* Market status and sectors lead the dashboard in 2.0. */}
            <aside className="home-context hidden xl:flex flex-col gap-4 w-48 shrink-0 sticky top-16" aria-label="Market status and sectors">
              <MarketStatusWidget />
              <Suspense fallback={<div className="card rounded-xl p-3"><SidebarSkeleton /></div>}>
                <SectorWidget />
              </Suspense>
            </aside>

            {/* ── Market insights ── */}
            <aside className="home-insights hidden xl:flex flex-col gap-4 w-48 shrink-0 sticky top-16">
              <Suspense fallback={<div className="card rounded-xl p-3"><SidebarSkeleton /></div>}>
                <MarketStatsWidget />
              </Suspense>
              <Suspense fallback={<div className="card rounded-xl p-3"><SidebarSkeleton /></div>}>
                <SentimentWidget />
              </Suspense>

              {/* Quick links */}
              <div className="card rounded-xl p-3 space-y-2">
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-3)" }}
                >
                  Quick Links
                </p>
                {[
                  { href: "/stocks", label: "📊 Stock Screener" },
                  { href: "/news",   label: "📰 News Feed"      },
                  { href: "/paper",  label: "💰 Paper Trading" },
                  { href: "/market-calendar", label: "🗓️ Market Calendar" },
                  { href: "/auth/login", label: "⭐ My Watchlist" },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block text-xs py-1 rounded transition-colors"
                    style={{ color: "var(--text-2)" }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </aside>
          </div>

        </div>
      </div>
    </div>
  );
}

function MoverRow({ m }: { m: StockPrice & { stocks: Stock } }) {
  const pct  = m.change_pct ?? 0;
  const isUp = pct >= 0;
  return (
    <Link
      href={`/stock/${m.ticker}`}
      className="card-clickable rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        {m.stocks?.logo_url ? (
          <LogoImage
            src={m.stocks.logo_url}
            ticker={m.ticker}
            width={18}
            height={18}
            className="rounded object-contain bg-white p-0.5 shrink-0"
            fallbackTextSize="text-[8px]"
            fallbackStyle={{ width: 18, height: 18, background: "var(--surface-3)", color: "var(--text-2)" }}
          />
        ) : (
          <div
            className="w-[18px] h-[18px] rounded flex items-center justify-center text-[8px] font-bold shrink-0"
            style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
          >
            {m.ticker[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{m.ticker}</p>
          <p className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>
            {m.stocks?.name}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold tabular-nums"
          style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
          {isUp ? "+" : ""}{pct.toFixed(2)}%
        </p>
        <p className="text-[10px] tabular-nums" style={{ color: "var(--text-3)" }}>
          {formatAssetPrice(m.price, m.ticker)}
        </p>
        <div className="mt-0.5 flex justify-end">
          <PriceFreshnessBadge fetchedAt={m.fetched_at} ticker={m.ticker} compact />
        </div>
      </div>
    </Link>
  );
}

function MoverGroup({
  label,
  gainers,
  losers,
  live,
}: {
  label: string;
  gainers: (StockPrice & { stocks: Stock })[];
  losers: (StockPrice & { stocks: Stock })[];
  live: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          {label}
        </p>
        {live && (
          <span className="badge badge-up text-[9px]">24/7 market</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: "var(--up)" }}>
            <span>▲</span> Top Gainers
          </p>
          <div className="space-y-1.5">
            {gainers.map((m) => <MoverRow key={m.ticker} m={m} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: "var(--down)" }}>
            <span>▼</span> Top Losers
          </p>
          <div className="space-y-1.5">
            {losers.map((m) => <MoverRow key={m.ticker} m={m} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
