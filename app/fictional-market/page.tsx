import type { Metadata } from "next";
import type { FictionalMarketEvent, FictionalSnapshot } from "@/data/fictional-market";
import { buildFictionalMarketEvents, buildFictionalMarketSnapshot, fictionalCompanies, formatFictionalMarketCap } from "@/data/fictional-market";
import { FictionalMarketTable } from "@/components/FictionalMarketTable";
import { FictionalTickerMark } from "@/components/FictionalTickerMark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Fictional Market — Multiverse Stocks",
  description: "Track fictional megacorporations as if they were listed public companies.",
};

function formatIndex(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

type FictionalCompanyDbRow = {
  ticker: string;
  name: string;
  source: string;
  exchange: "FICTDAQ" | "OMNI" | "NSE" | "LUNA";
  sector: FictionalSnapshot["sector"];
  risk: FictionalSnapshot["risk"];
  market_cap: number;
  base_price: number;
  float_shares: number;
  volatility: number;
  influence: number;
  technology: number;
  color: string;
  accent: string;
  note: string;
};

type FictionalPriceDbRow = {
  ticker: string;
  price: number;
  change_pct: number;
  volume: number;
  pe_ratio: number | null;
  dividend_yield: number | null;
};

type FictionalEventDbRow = {
  ticker: string | null;
  headline: string;
  impact_pct: number;
  severity: "routine" | "material" | "chaotic";
};

async function getFictionalMarketData(): Promise<{ rows: FictionalSnapshot[]; events: FictionalMarketEvent[] }> {
  const fallbackRows = buildFictionalMarketSnapshot();
  const fallbackEvents = buildFictionalMarketEvents();

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: companies }, { data: prices }, { data: dbEvents }] = await Promise.all([
      supabase.from("fictional_companies").select("*").order("market_cap", { ascending: false }),
      supabase.from("fictional_prices").select("*"),
      supabase.from("fictional_market_events").select("ticker, headline, impact_pct, severity").order("event_at", { ascending: false }).limit(12),
    ]);

    if (!companies?.length || !prices?.length) {
      return { rows: fallbackRows, events: fallbackEvents };
    }

    const fallbackByTicker = new Map(fallbackRows.map((row) => [row.ticker, row]));
    const canonicalByTicker = new Map(fictionalCompanies.map((company) => [company.ticker, company]));
    const priceByTicker = new Map((prices as FictionalPriceDbRow[]).map((price) => [price.ticker, price]));
    const rows = (companies as FictionalCompanyDbRow[])
      .map((company) => {
        const price = priceByTicker.get(company.ticker);
        const fallback = fallbackByTicker.get(company.ticker);
        const canonical = canonicalByTicker.get(company.ticker);
        if (!price || !fallback || !canonical) return null;
        return {
          ...canonical,
          name: company.name,
          source: company.source,
          sector: company.sector,
          exchange: company.exchange,
          marketCap: Number(company.market_cap),
          basePrice: Number(company.base_price),
          floatShares: Number(company.float_shares),
          volatility: Number(company.volatility),
          risk: company.risk,
          influence: Number(company.influence),
          technology: Number(company.technology),
          color: company.color,
          accent: company.accent,
          note: company.note,
          price: Number(price.price),
          changePct: Number(price.change_pct),
          volume: Number(price.volume),
          peRatio: price.pe_ratio == null ? null : Number(price.pe_ratio),
          dividendYield: price.dividend_yield == null ? null : Number(price.dividend_yield),
          news: fallback.news,
          sparkline: fallback.sparkline,
        } satisfies FictionalSnapshot;
      })
      .filter((row): row is FictionalSnapshot => row != null)
      .sort((a, b) => b.marketCap - a.marketCap);

    if (!rows.length) {
      return { rows: fallbackRows, events: fallbackEvents };
    }

    const events = ((dbEvents as FictionalEventDbRow[] | null) ?? []).map((event) => ({
      ticker: event.ticker ?? "OMNI",
      headline: event.headline,
      impactPct: Number(event.impact_pct),
      severity: event.severity,
    }));

    return { rows, events: events.length ? events : fallbackEvents };
  } catch {
    return { rows: fallbackRows, events: fallbackEvents };
  }
}

export default async function FictionalMarketPage() {
  const { rows, events } = await getFictionalMarketData();
  const totalMarketCap = rows.reduce((sum, row) => sum + row.marketCap, 0);
  const weightedChange = rows.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / totalMarketCap;
  const indexLevel = 10_000 * (1 + weightedChange / 100);
  const advancers = rows.filter((row) => row.changePct > 0).length;
  const decliners = rows.length - advancers;
  const largest = rows[0];
  const topMover = [...rows].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  const riskiest = rows.filter((row) => row.risk === "Existential").length;

  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="flex flex-col gap-5 mb-7">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(124,108,252,0.2)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Multiverse exchange
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
              Fictional Market
            </h1>
            <p className="text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed" style={{ color: "var(--text-3)" }}>
              100 media-born megacorps priced as public equities with separate fictional-market data plumbing.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:min-w-[520px]">
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                OMNICAP 100
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{formatIndex(indexLevel)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: weightedChange >= 0 ? "var(--up)" : "var(--down)" }}>
                {weightedChange >= 0 ? "+" : ""}{weightedChange.toFixed(2)}%
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Market cap
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{formatFictionalMarketCap(totalMarketCap)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{rows.length} listings</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Breadth
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{advancers}/{decliners}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>up/down</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Red flags
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{riskiest}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>existential risk</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
          <section className="card p-4">
            <div className="flex items-center gap-3">
              <FictionalTickerMark ticker={largest.ticker} color={largest.color} accent={largest.accent} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Largest constituent
                </p>
                <h2 className="text-lg font-semibold truncate mt-0.5" style={{ color: "var(--text)" }}>
                  {largest.name}
                </h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-2)" }}>
                  {largest.note}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatFictionalMarketCap(largest.marketCap)}</p>
                <p className="text-xs mt-0.5" style={{ color: largest.changePct >= 0 ? "var(--up)" : "var(--down)" }}>
                  {largest.changePct >= 0 ? "+" : ""}{largest.changePct.toFixed(2)}%
                </p>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Wildest print
                </p>
                <h2 className="text-lg font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                  {topMover.ticker}
                </h2>
              </div>
              <FictionalTickerMark ticker={topMover.ticker} color={topMover.color} accent={topMover.accent} />
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--text-2)" }}>
              {topMover.news}
            </p>
            <p className="text-xl font-bold mt-3" style={{ color: topMover.changePct >= 0 ? "var(--up)" : "var(--down)" }}>
              {topMover.changePct >= 0 ? "+" : ""}{topMover.changePct.toFixed(2)}%
            </p>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        <FictionalMarketTable rows={rows} />

        <aside className="space-y-4 xl:sticky xl:top-20">
          <section className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Market tape</h2>
              <span className="badge badge-muted">Simulated</span>
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <div key={`${event.ticker}-${event.headline}`} className="pb-3 last:pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{event.ticker}</span>
                    <span className="text-xs font-semibold" style={{ color: event.impactPct >= 0 ? "var(--up)" : "var(--down)" }}>
                      {event.impactPct >= 0 ? "+" : ""}{event.impactPct.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed mt-1" style={{ color: "var(--text-2)" }}>
                    {event.headline}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Name and logo policy</h2>
            <p className="text-[11px] leading-relaxed mt-2" style={{ color: "var(--text-3)" }}>
              Company names are used as fictional references. Ticker marks are original abstract badges, not official logos or trade dress.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
