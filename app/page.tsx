import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewsArticle, StockPrice, Stock } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { WatchlistSection } from "@/components/WatchlistSection";
import { MarketStatusWidget } from "@/components/MarketStatusWidget";
import { SectorWidget } from "@/components/SectorWidget";
import { MarketStatsWidget } from "@/components/MarketStatsWidget";
import { SentimentWidget } from "@/components/SentimentWidget";
import { SentimentBadge } from "@/components/SentimentBadge";
import { timeAgo } from "@/lib/utils";
import { AdSlot } from "@/components/AdSlot";

async function getMovers(): Promise<{
  gainers: (StockPrice & { stocks: Stock })[];
  losers:  (StockPrice & { stocks: Stock })[];
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("stock_prices")
      .select("*, stocks(*)")
      .not("change_pct", "is", null);
    const all = (data as (StockPrice & { stocks: Stock })[]) ?? [];
    const sorted = [...all].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
    return {
      gainers: sorted.slice(0, 5),
      losers:  sorted.slice(-5).reverse(),
    };
  } catch {
    return { gainers: [], losers: [] };
  }
}

async function getLatestNews(limit = 20): Promise<NewsArticle[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("news_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
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
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ gainers, losers }, news] = await Promise.all([
    getMovers(),
    getLatestNews(user ? 20 : 6),
  ]);

  return (
    <div>
      {/* ── Landing hero (guest only) ── */}
      {!user && (
        <div className="hero-gradient relative overflow-hidden">
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
              Live market data
            </div>

            <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.1] mb-5 max-w-3xl mx-auto tracking-tight fade-up">
              <span className="gradient-text">Track. Analyze.</span>
              <br />
              <span style={{ color: "var(--text)" }}>Paper Trade.</span>
            </h1>

            <p
              className="text-base sm:text-lg max-w-xl mx-auto mb-10 leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              Real-time S&amp;P 100 prices, AI-powered news analysis,
              and a full paper trading simulator — completely free.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap stagger">
              <Link href="/auth/login" className="btn btn-primary btn-xl">
                Get started free
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link href="#markets" className="btn btn-secondary btn-xl">
                View markets
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 mt-14 stagger">
              {[
                { label: "S&P 100 + 19 Crypto" },
                { label: "AI News Analysis" },
                { label: "Paper Trading" },
                { label: "What If Calculator" },
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
      <div className="max-w-7xl mx-auto px-5 py-8" id="markets">

        {/* Page title — always visible */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Markets
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            Real-time prices &amp; AI-powered news
          </p>
        </div>

        <div className="flex gap-5 items-start">

          {/* ── Left sidebar ── */}
          <aside className="hidden xl:flex flex-col gap-4 w-48 shrink-0 sticky top-16">
            <MarketStatusWidget />
            <Suspense fallback={<div className="card rounded-xl p-3"><SidebarSkeleton /></div>}>
              <SectorWidget />
            </Suspense>
          </aside>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">

            {/* Watchlist (logged-in only) */}
            {user && <WatchlistSection userId={user.id} />}

            {/* Movers */}
            <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-3)" }}
                >
                  Today&apos;s Movers
                </p>
                <Link href="/stocks" className="nav-link text-xs">
                  All stocks →
                </Link>
              </div>

              {gainers.length === 0 ? (
                <div
                  className="card rounded-xl px-5 py-8 text-sm text-center"
                  style={{ color: "var(--text-2)" }}
                >
                  Market data unavailable — updates during trading hours (9:30 AM – 4:00 PM ET)
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Gainers */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1"
                      style={{ color: "var(--up)" }}>
                      <span>▲</span> Top Gainers
                    </p>
                    <div className="space-y-1.5">
                      {gainers.map((m) => <MoverRow key={m.ticker} m={m} />)}
                    </div>
                  </div>
                  {/* Losers */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1"
                      style={{ color: "var(--down)" }}>
                      <span>▼</span> Top Losers
                    </p>
                    <div className="space-y-1.5">
                      {losers.map((m) => <MoverRow key={m.ticker} m={m} />)}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Ad: leaderboard between movers and news */}
            <AdSlot slot="home-leaderboard" format="horizontal" className="mb-10" />

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
                <div className="space-y-2">
                  {news.map((article) => (
                    <NewsCard key={article.id} article={article} isLoggedIn={!!user} />
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

          {/* ── Right sidebar ── */}
          <aside className="hidden xl:flex flex-col gap-4 w-48 shrink-0 sticky top-16">
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
                { href: "/whatif", label: "🔮 What If?" },
                { href: "/paper",  label: "💰 Paper Trading" },
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
          <Image
            src={m.stocks.logo_url}
            alt={m.ticker}
            width={18}
            height={18}
            className="rounded object-contain bg-white p-0.5 shrink-0"
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
          ${m.price.toFixed(2)}
        </p>
      </div>
    </Link>
  );
}

function NewsCard({
  article,
  isLoggedIn,
}: {
  article: NewsArticle;
  isLoggedIn: boolean;
}) {
  const sc = article.ai_sentiment;
  const barColor =
    sc === "positive" ? "var(--up)" :
    sc === "negative" ? "var(--down)" :
    "var(--border-md)";

  return (
    <article className="card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-0.5 self-stretch rounded-full shrink-0"
          style={{ background: barColor }}
        />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {article.ticker && (
              <Link
                href={`/stock/${article.ticker}`}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
              >
                {article.ticker}
              </Link>
            )}
            {article.source && (
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                {article.source}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {timeAgo(article.published_at)}
            </span>
          </div>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium leading-snug external-link"
            style={{ color: "var(--text)" }}
          >
            {article.title}
          </a>

          {article.ai_summary ? (
            <div
              className="rounded-lg p-3 space-y-1.5"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                >
                  AI
                </span>
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
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                Not investment advice
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
              style={{
                background: "var(--surface-2)",
                border: "1px dashed var(--border-md)",
                color: "var(--text-3)",
              }}
            >
              <span>🔒</span>
              {isLoggedIn ? (
                <span>AI summary not yet available</span>
              ) : (
                <>
                  <Link href="/auth/login" className="link-accent">
                    Sign up free
                  </Link>
                  <span>to see AI Summary</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
