import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Daily Market Brief",
  description: "AI-generated daily market summary with top movers, crypto overview, and key market drivers.",
};

interface Mover {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
}

interface MarketBrief {
  date: string;
  headline: string;
  overall_sentiment: "bullish" | "bearish" | "neutral";
  summary: string;
  bullets: string[];
  crypto_notes: string;
  sector_notes: string;
  top_gainers: Mover[];
  top_losers: Mover[];
  sentiment_breakdown: { positive: number; neutral: number; negative: number; unknown: number };
  news_count: number;
  generated_at: string;
}

const SENTIMENT_STYLE = {
  bullish: { color: "var(--up)",   bg: "var(--up-dim)",   label: "Bullish Day"  },
  bearish: { color: "var(--down)", bg: "var(--down-dim)", label: "Bearish Day"  },
  neutral: { color: "var(--text-2)", bg: "var(--surface-3)", label: "Mixed Day" },
};

async function getBrief(): Promise<MarketBrief | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("market_briefs")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .single();
  return data as MarketBrief | null;
}

async function getPastBriefs(): Promise<Pick<MarketBrief, "date" | "headline" | "overall_sentiment">[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("market_briefs")
    .select("date, headline, overall_sentiment")
    .order("date", { ascending: false })
    .range(1, 7);
  return (data ?? []) as Pick<MarketBrief, "date" | "headline" | "overall_sentiment">[];
}

function MoverCard({ mover, isGainer }: { mover: Mover; isGainer: boolean }) {
  const color = isGainer ? "var(--up)" : "var(--down)";
  const bg    = isGainer ? "var(--up-dim)" : "var(--down-dim)";
  return (
    <Link href={`/stock/${mover.ticker}`}
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{mover.ticker}</p>
        <p className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>{mover.name}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--text)" }}>
          ${mover.price.toFixed(2)}
        </p>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums"
          style={{ background: bg, color }}>
          {mover.change_pct >= 0 ? "+" : ""}{mover.change_pct.toFixed(2)}%
        </span>
      </div>
    </Link>
  );
}

function SentimentBar({ breakdown }: { breakdown: MarketBrief["sentiment_breakdown"] }) {
  const segments = [
    { key: "positive", label: "Positive", color: "var(--up)",   pct: breakdown.positive },
    { key: "neutral",  label: "Neutral",  color: "var(--text-3)", pct: breakdown.neutral  },
    { key: "negative", label: "Negative", color: "var(--down)", pct: breakdown.negative },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
        {segments.map(s => s.pct > 0 && (
          <div key={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
        {segments.map(s => (
          <span key={s.key} style={{ color: s.color }}>
            {s.label} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function MarketBriefPage() {
  const [brief, past] = await Promise.all([getBrief(), getPastBriefs()]);

  if (!brief) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-16 text-center space-y-3">
        <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>No Brief Yet</p>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          The daily market brief is generated after market close. Check back later.
        </p>
      </div>
    );
  }

  const sentStyle = SENTIMENT_STYLE[brief.overall_sentiment] ?? SENTIMENT_STYLE.neutral;
  const genDate = new Date(brief.generated_at);
  const dateLabel = new Date(brief.date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6 fade-up">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
            style={{ background: sentStyle.bg, color: sentStyle.color }}>
            {sentStyle.label}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
            {dateLabel}
          </span>
        </div>
        <h1 className="text-2xl font-bold leading-snug" style={{ color: "var(--text)" }}>
          {brief.headline}
        </h1>
        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
          Generated {genDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ·{" "}
          Based on {brief.news_count} articles · AI generated · Not financial advice
        </p>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Narrative + Bullets */}
        <div className="lg:col-span-2 space-y-5">

          {/* AI Narrative */}
          <div className="card rounded-xl p-5 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Market Overview
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              {brief.summary}
            </p>
          </div>

          {/* Key Bullets */}
          {brief.bullets?.length > 0 && (
            <div className="card rounded-xl p-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Key Takeaways
              </p>
              <div className="space-y-2.5">
                {brief.bullets.map((b, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs font-black tabular-nums shrink-0 mt-0.5"
                      style={{ color: "var(--accent)" }}>{i + 1}</span>
                    <p className="text-sm" style={{ color: "var(--text)" }}>{b}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Movers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Gainers */}
            <div className="card rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--up)" }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--up)" }}>
                  Top Gainers
                </p>
              </div>
              <div className="space-y-1.5">
                {(brief.top_gainers ?? []).map(m => (
                  <MoverCard key={m.ticker} mover={m} isGainer={true} />
                ))}
              </div>
            </div>

            {/* Losers */}
            <div className="card rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--down)" }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--down)" }}>
                  Top Losers
                </p>
              </div>
              <div className="space-y-1.5">
                {(brief.top_losers ?? []).map(m => (
                  <MoverCard key={m.ticker} mover={m} isGainer={false} />
                ))}
              </div>
            </div>
          </div>

          {/* Crypto Notes */}
          {brief.crypto_notes && (
            <div className="card rounded-xl p-5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#f97316" }}>
                Crypto Overview
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                {brief.crypto_notes}
              </p>
            </div>
          )}

          {/* Sector Notes */}
          {brief.sector_notes && (
            <div className="card rounded-xl p-5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Sector Notes
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                {brief.sector_notes}
              </p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">

          {/* News Sentiment Breakdown */}
          {brief.sentiment_breakdown && (
            <div className="card rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                News Sentiment
              </p>
              <SentimentBar breakdown={brief.sentiment_breakdown} />
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                Based on {brief.news_count} articles today
              </p>
            </div>
          )}

          {/* Past Briefs */}
          {past.length > 0 && (
            <div className="card rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Previous Briefs
              </p>
              <div className="space-y-2">
                {past.map(p => {
                  const ps = SENTIMENT_STYLE[p.overall_sentiment] ?? SENTIMENT_STYLE.neutral;
                  return (
                    <div key={p.date} className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: ps.bg, color: ps.color }}>
                          {p.overall_sentiment}
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--text-3)" }}>{p.date}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--text-2)" }}>{p.headline}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="card rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              Explore
            </p>
            {[
              { href: "/news",   label: "News Feed"     },
              { href: "/stocks", label: "Stock Screener" },
              { href: "/paper",  label: "Paper Trade"    },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className="flex items-center justify-between text-xs px-3 py-2 rounded-lg transition-colors"
                style={{ color: "var(--text-2)", border: "1px solid var(--border)" }}>
                {label}
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>

        </aside>
      </div>
    </div>
  );
}
