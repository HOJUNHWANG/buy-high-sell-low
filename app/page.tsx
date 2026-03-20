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
          <div className="max-w-7xl mx-auto px-5 py-20 text-center">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(124,108,252,0.25)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Live market data
            </div>

            <h1
              className="text-4xl sm:text-5xl font-bold leading-tight mb-4 max-w-2xl mx-auto"
              style={{ color: "var(--text)" }}
            >
              US stocks, news &{" "}
              <span style={{ color: "var(--accent)" }}>AI analysis</span>
              <br />in one place
            </h1>

            <p
              className="text-base max-w-xl mx-auto mb-8"
              style={{ color: "var(--text-2)" }}
            >
              Real-time prices, curated market news with Claude AI summaries,
              and a personal watchlist — completely free.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/auth/login"
                className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Get started free →
              </Link>
              <Link
                href="#markets"
                className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{ color: "var(--text-2)", border: "1px solid var(--border-md)" }}
              >
                View markets
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-10">
              {[
                { icon: "📈", label: "99+ stocks tracked" },
                { icon: "🤖", label: "AI news summaries" },
                { icon: "⭐", label: "Personal watchlist" },
                { icon: "🔔", label: "Updated hourly" },
              ].map(({ icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  <span>{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3-column layout ── */}
      <div className="max-w-7xl mx-auto px-5 py-8" id="markets">
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
                  className="mt-6 rounded-xl p-6 text-center"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
                    See all news + AI analysis
                  </p>
                  <p className="text-xs mb-4" style={{ color: "var(--text-2)" }}>
                    Sign up free to unlock unlimited news, AI summaries, and your personal watchlist.
                  </p>
                  <Link
                    href="/auth/login"
                    className="inline-block px-5 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Create free account →
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
