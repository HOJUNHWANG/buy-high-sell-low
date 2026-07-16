import type { Metadata } from "next";
import Link from "next/link";
import type { FictionalSnapshot } from "@/data/fictional-market";
import {
  buildFictionalMarketSnapshot,
  fictionalCompanies,
  fictionalExchangeOrder,
  fictionalExchanges,
  formatFictionalMarketCap,
} from "@/data/fictional-market";
import { FictionalMarketTable } from "@/components/FictionalMarketTable";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Fictional Market — Multiverse Stocks",
  description: "Track fictional megacorporations as if they were listed public companies.",
};

function formatIndex(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function buildMarketIndex(
  code: string,
  name: string,
  description: string,
  baseLevel: number,
  constituents: FictionalSnapshot[],
) {
  const marketCap = constituents.reduce((sum, row) => sum + row.marketCap, 0);
  const changePct = constituents.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / marketCap;

  return {
    code,
    name,
    description,
    constituentCount: constituents.length,
    changePct,
    level: baseLevel * (1 + changePct / 100),
  };
}

function buildFallbackThirtyDayChanges(rows: FictionalSnapshot[], now = new Date()) {
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const historicalPriceByTicker = new Map(
    buildFictionalMarketSnapshot(thirtyDaysAgo).map((row) => [row.ticker, row.price]),
  );

  return new Map(rows.map((row) => {
    const historicalPrice = historicalPriceByTicker.get(row.ticker) ?? row.price;
    return [row.ticker, ((row.price / historicalPrice) - 1) * 100];
  }));
}

type ThirtyDayPerformer = FictionalSnapshot & {
  thirtyDayChangePct: number;
};

function VenuePerformanceCard({
  title,
  performers,
  tone,
}: {
  title: string;
  performers: ThirtyDayPerformer[];
  tone: "best" | "worst";
}) {
  const color = tone === "best" ? "var(--up)" : "var(--down)";

  return (
    <section className="card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{title}</p>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>30D</span>
      </div>
      <div className="space-y-1">
        {performers.length ? performers.map((company, index) => (
          <Link
            key={company.ticker}
            href={`/fictional-market/${company.ticker}`}
            className="flex items-center justify-between gap-2 py-1 text-xs transition-opacity hover:opacity-75"
          >
            <span className="min-w-0 flex items-center gap-1.5">
              <span className="w-3 text-[10px]" style={{ color: "var(--text-3)" }}>{index + 1}</span>
              <span className="font-semibold truncate" style={{ color: "var(--text)" }}>{company.ticker}</span>
            </span>
            <span className="shrink-0 font-semibold" style={{ color }}>
              {company.thirtyDayChangePct >= 0 ? "+" : ""}{company.thirtyDayChangePct.toFixed(1)}%
            </span>
          </Link>
        )) : (
          <p className="py-5 text-center text-[11px]" style={{ color: "var(--text-3)" }}>30-day history loading</p>
        )}
      </div>
    </section>
  );
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

type FictionalDailyHistoryDbRow = {
  ticker: string;
  date: string;
  close: number;
};

type FictionalMarketData = {
  rows: FictionalSnapshot[];
  thirtyDayChangeByTicker: Map<string, number>;
};

async function getFictionalMarketData(): Promise<FictionalMarketData> {
  const fallbackRows = buildFictionalMarketSnapshot();
  const fallback = { rows: fallbackRows, thirtyDayChangeByTicker: buildFallbackThirtyDayChanges(fallbackRows) };

  try {
    const supabase = await createSupabaseServerClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const historyStart = new Date(thirtyDaysAgo);
    historyStart.setUTCDate(historyStart.getUTCDate() - 7);
    const targetDate = thirtyDaysAgo.toISOString().slice(0, 10);
    const historyStartDate = historyStart.toISOString().slice(0, 10);

    const [{ data: companies }, { data: prices }, { data: history }] = await Promise.all([
      supabase.from("fictional_companies").select("*").order("market_cap", { ascending: false }),
      supabase.from("fictional_prices").select("*"),
      supabase
        .from("fictional_price_history_daily")
        .select("ticker, date, close")
        .gte("date", historyStartDate)
        .lte("date", targetDate),
    ]);

    if (!companies?.length || !prices?.length) {
      return fallback;
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
      return fallback;
    }

    const closestCloseByTicker = new Map<string, FictionalDailyHistoryDbRow>();
    for (const historyRow of (history as FictionalDailyHistoryDbRow[] | null ?? [])) {
      const existing = closestCloseByTicker.get(historyRow.ticker);
      if (!existing || historyRow.date > existing.date) {
        closestCloseByTicker.set(historyRow.ticker, historyRow);
      }
    }
    const thirtyDayChangeByTicker = new Map<string, number>();
    const fallbackThirtyDayChangeByTicker = buildFallbackThirtyDayChanges(rows);
    for (const row of rows) {
      const historical = closestCloseByTicker.get(row.ticker);
      const changePct = historical && Number(historical.close) > 0
        ? ((row.price / Number(historical.close)) - 1) * 100
        : fallbackThirtyDayChangeByTicker.get(row.ticker);
      if (changePct != null) thirtyDayChangeByTicker.set(row.ticker, changePct);
    }

    return { rows, thirtyDayChangeByTicker };
  } catch {
    return fallback;
  }
}

export default async function FictionalMarketPage() {
  const { rows, thirtyDayChangeByTicker } = await getFictionalMarketData();
  const apexConstituents = [...rows].sort((a, b) => b.marketCap - a.marketCap).slice(0, 50);
  const novaConstituents = rows
    .filter((row) => ["Artificial Intelligence", "Biotech", "Cybernetics", "Space"].includes(row.sector))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 30);
  const marketIndices = [
    buildMarketIndex(
      "OMNICAP 100",
      "All-market benchmark",
      "Every listed company across the three competing venues.",
      10_000,
      rows,
    ),
    buildMarketIndex(
      "APEX 50",
      "Megacap benchmark",
      "The 50 largest listed companies, weighted by market capitalization.",
      5_000,
      apexConstituents,
    ),
    buildMarketIndex(
      "NOVA 30",
      "Frontier innovation benchmark",
      "The 30 largest AI, biotech, cybernetics, and space companies, where FICTDAQ and LUNA compete most intensely.",
      2_500,
      novaConstituents,
    ),
  ];
  const exchangeStats = fictionalExchangeOrder.map((exchange) => {
    const constituents = rows.filter((row) => row.exchange === exchange);
    const marketCap = constituents.reduce((sum, row) => sum + row.marketCap, 0);
    const changePct = constituents.reduce((sum, row) => sum + row.changePct * row.marketCap, 0) / marketCap;
    const performers = constituents.flatMap((company) => {
      const thirtyDayChangePct = thirtyDayChangeByTicker.get(company.ticker);
      return thirtyDayChangePct == null ? [] : [{ ...company, thirtyDayChangePct }];
    });
    return {
      exchange,
      ...fictionalExchanges[exchange],
      constituents,
      marketCap,
      changePct,
      best: [...performers].sort((a, b) => b.thirtyDayChangePct - a.thirtyDayChangePct).slice(0, 5),
      worst: [...performers].sort((a, b) => a.thirtyDayChangePct - b.thirtyDayChangePct).slice(0, 5),
    };
  });

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:min-w-[650px]">
            {marketIndices.map((index) => (
              <div key={index.code} className="card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    {index.code}
                  </p>
                  <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{index.constituentCount} names</span>
                </div>
                <p className="text-lg font-bold mt-1" style={{ color: "var(--text)" }}>{formatIndex(index.level)}</p>
                <p className="text-[11px] mt-0.5" style={{ color: index.changePct >= 0 ? "var(--up)" : "var(--down)" }}>
                  {index.changePct >= 0 ? "+" : ""}{index.changePct.toFixed(2)}% · {index.name}
                </p>
              </div>
            ))}
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
              <section key={venue.exchange} className="space-y-2">
                <div className="card p-4 min-h-[244px]">
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
                  <p className="text-[11px] leading-relaxed mt-4 pt-3 min-h-9" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                    {venue.rivalry}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <VenuePerformanceCard title="Best 5" performers={venue.best} tone="best" />
                  <VenuePerformanceCard title="Worst 5" performers={venue.worst} tone="worst" />
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>

      <FictionalMarketTable rows={rows} />
    </div>
  );
}
