import type { Metadata } from "next";
import type { FictionalSnapshot } from "@/data/fictional-market";
import {
  buildFictionalMarketSnapshot,
  fictionalCompanies,
  fictionalExchangeOrder,
  fictionalExchanges,
  formatFictionalMarketCap,
  getFictionalCompanyProfile,
} from "@/data/fictional-market";
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

function statBar(value: number) {
  return `${Math.min(100, Math.max(0, value))}%`;
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

async function getFictionalMarketData(): Promise<FictionalSnapshot[]> {
  const fallbackRows = buildFictionalMarketSnapshot();

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: companies }, { data: prices }] = await Promise.all([
      supabase.from("fictional_companies").select("*").order("market_cap", { ascending: false }),
      supabase.from("fictional_prices").select("*"),
    ]);

    if (!companies?.length || !prices?.length) {
      return fallbackRows;
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
          exchange: canonical.exchange,
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
      return fallbackRows;
    }
    return rows;
  } catch {
    return fallbackRows;
  }
}

export default async function FictionalMarketPage() {
  const rows = await getFictionalMarketData();
  const totalMarketCap = rows.reduce((sum, row) => sum + row.marketCap, 0);
  const weightedChange = rows.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / totalMarketCap;
  const indexLevel = 10_000 * (1 + weightedChange / 100);
  const apexConstituents = [...rows].sort((a, b) => b.marketCap - a.marketCap).slice(0, 50);
  const apexMarketCap = apexConstituents.reduce((sum, row) => sum + row.marketCap, 0);
  const apexChange = apexConstituents.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / apexMarketCap;
  const apexIndexLevel = 5_000 * (1 + apexChange / 100);
  const advancers = rows.filter((row) => row.changePct > 0).length;
  const decliners = rows.length - advancers;
  const largest = rows[0];
  const topMover = [...rows].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  const averageTech = rows.reduce((sum, row) => sum + row.technology, 0) / rows.length;
  const averageInfluence = rows.reduce((sum, row) => sum + row.influence, 0) / rows.length;
  const exchangeStats = fictionalExchangeOrder.map((exchange) => {
    const constituents = rows.filter((row) => row.exchange === exchange);
    const marketCap = constituents.reduce((sum, row) => sum + row.marketCap, 0);
    const changePct = constituents.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / marketCap;
    return { exchange, ...fictionalExchanges[exchange], constituents, marketCap, changePct };
  });
  const topSectors = Object.entries(rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.sector] = (counts[row.sector] ?? 0) + 1;
    return counts;
  }, {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

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
              100 media-born megacorps priced as public equities in one shared listing universe, with sovereign claims, monopolies, and apocalyptic patents marked down by exchange oversight.
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
                APEX 50
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{formatIndex(apexIndexLevel)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: apexChange >= 0 ? "var(--up)" : "var(--down)" }}>
                {apexChange >= 0 ? "+" : ""}{apexChange.toFixed(2)}% · largest 50
              </p>
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
                Market cap
              </p>
              <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{formatFictionalMarketCap(totalMarketCap)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{rows.length} listings · 3 venues</p>
           </div>
         </div>

        <section
          className="flex items-start gap-3 px-4 py-3 rounded-lg"
          style={{ background: "var(--accent-dim)", border: "1px solid rgba(124,108,252,0.3)" }}
          role="note"
        >
          <span className="mt-0.5 text-sm font-bold" style={{ color: "var(--accent)" }}>i</span>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Fictional names, original ticker marks</p>
            <p className="text-[11px] leading-relaxed mt-1" style={{ color: "var(--text-2)" }}>
              Company names appear only as fictional references. Every ticker mark on this page is an original abstract badge, not an official logo or trade dress.
            </p>
          </div>
        </section>
        </div>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Competing venues
              </p>
              <h2 className="text-lg font-semibold mt-1" style={{ color: "var(--text)" }}>Three exchanges, one contested market</h2>
            </div>
            <p className="text-[11px] max-w-md sm:text-right leading-relaxed" style={{ color: "var(--text-3)" }}>
              Constituents are rebalanced by market cap so no board becomes the default home of the multiverse economy.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {exchangeStats.map((venue) => (
              <section key={venue.exchange} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>{venue.exchange}</p>
                    <h3 className="text-sm font-semibold mt-1" style={{ color: "var(--text)" }}>{venue.name}</h3>
                  </div>
                  <span className="badge badge-muted">{venue.constituents.length} listed</span>
                </div>
                <p className="text-[11px] leading-relaxed mt-3 min-h-9" style={{ color: "var(--text-2)" }}>{venue.focus}</p>
                <div className="flex items-end justify-between gap-3 mt-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Venue cap</p>
                    <p className="text-base font-semibold mt-1" style={{ color: "var(--text)" }}>{formatFictionalMarketCap(venue.marketCap)}</p>
                  </div>
                  <p className="text-lg font-bold" style={{ color: venue.changePct >= 0 ? "var(--up)" : "var(--down)" }}>
                    {venue.changePct >= 0 ? "+" : ""}{venue.changePct.toFixed(2)}%
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed mt-4 pt-3" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                  {venue.rivalry}
                </p>
              </section>
            ))}
          </div>
        </section>

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
                  {getFictionalCompanyProfile(largest.ticker, largest.note)}
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

        <section className="card p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Listing premise
              </p>
              <h2 className="text-base font-semibold mt-1" style={{ color: "var(--text)" }}>
                Power, but not unchecked power
              </h2>
              <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--text-2)" }}>
                Each company keeps its signature technology and political reach, but the exchange assumes a shared antitrust regime, cross-world capital rules, and enough rival megacorps to prevent any single canon from owning the board.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Market pressure
                </p>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>average scores</span>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex justify-between text-[11px]" style={{ color: "var(--text-2)" }}>
                    <span>Technology depth</span>
                    <span>{averageTech.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--surface-3)" }}>
                    <div className="h-full rounded-full" style={{ width: statBar(averageTech), background: "var(--accent)" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px]" style={{ color: "var(--text-2)" }}>
                    <span>Institutional influence</span>
                    <span>{averageInfluence.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--surface-3)" }}>
                    <div className="h-full rounded-full" style={{ width: statBar(averageInfluence), background: "var(--up)" }} />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Active sectors
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {topSectors.map(([sector, count]) => (
                  <span key={sector} className="badge badge-muted">
                    {sector} · {count}
                  </span>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed mt-3" style={{ color: "var(--text-3)" }}>
                Sector labels are normalized for this market, so a planet-scale utility, a weapons contractor, and a consumer empire can be compared without importing every original setting literally.
              </p>
            </div>
          </div>
        </section>
      </div>

      <FictionalMarketTable rows={rows} />
    </div>
  );
}
