import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FictionalTickerMark } from "@/components/FictionalTickerMark";
import { StockChart } from "@/components/StockChart";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StockPriceHistory } from "@/lib/types";
import type { FictionalCompany, FictionalRisk, FictionalSector } from "@/data/fictional-market";
import { buildFictionalMarketSnapshot, fictionalCompanies, formatFictionalMarketCap } from "@/data/fictional-market";

type Props = {
  params: Promise<{ ticker: string }>;
};

type FictionalCompanyRow = {
  ticker: string;
  name: string;
  source: string;
  exchange: FictionalCompany["exchange"];
  sector: FictionalSector;
  risk: FictionalRisk;
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

type FictionalPriceRow = {
  ticker: string;
  price: number;
  change_pct: number;
  volume: number;
  pe_ratio: number | null;
  dividend_yield: number | null;
  fetched_at: string;
};

type DailyHistoryRow = {
  close: number;
  date: string;
};

type EventRow = {
  headline: string;
  impact_pct: number;
  severity: "routine" | "material" | "chaotic";
  event_at: string;
};

function formatVolume(value: number | null | undefined) {
  if (value == null) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}

function riskClass(risk: FictionalRisk) {
  if (risk === "Existential" || risk === "Extreme") return "badge-down";
  if (risk === "High") return "badge-warn";
  if (risk === "Moderate") return "badge-muted";
  return "badge-up";
}

const getFictionalStockData = cache(async function getFictionalStockData(ticker: string) {
  const canonical = fictionalCompanies.find((company) => company.ticker === ticker);
  if (!canonical) return null;

  const fallback = buildFictionalMarketSnapshot().find((row) => row.ticker === ticker);
  const supabase = await createSupabaseServerClient();

  try {
    const [companyRes, priceRes, intradayRes, dailyRes, eventsRes] = await Promise.all([
      supabase.from("fictional_companies").select("*").eq("ticker", ticker).maybeSingle(),
      supabase.from("fictional_prices").select("*").eq("ticker", ticker).maybeSingle(),
      supabase
        .from("fictional_price_history")
        .select("price, recorded_at")
        .eq("ticker", ticker)
        .gte("recorded_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("recorded_at", { ascending: false }),
      supabase
        .from("fictional_price_history_daily")
        .select("close, date")
        .eq("ticker", ticker)
        .gte("date", new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .order("date", { ascending: false }),
      supabase
        .from("fictional_market_events")
        .select("headline, impact_pct, severity, event_at")
        .eq("ticker", ticker)
        .order("event_at", { ascending: false })
        .limit(8),
    ]);

    const dbCompany = companyRes.data as FictionalCompanyRow | null;
    const dbPrice = priceRes.data as FictionalPriceRow | null;
    const company = dbCompany
      ? {
          ...canonical,
          name: dbCompany.name,
          source: dbCompany.source,
          exchange: dbCompany.exchange,
          sector: dbCompany.sector,
          risk: dbCompany.risk,
          marketCap: Number(dbCompany.market_cap),
          basePrice: Number(dbCompany.base_price),
          floatShares: Number(dbCompany.float_shares),
          volatility: Number(dbCompany.volatility),
          influence: Number(dbCompany.influence),
          technology: Number(dbCompany.technology),
          color: dbCompany.color,
          accent: dbCompany.accent,
          note: dbCompany.note,
        }
      : canonical;

    const price = dbPrice ?? (fallback
      ? {
          ticker,
          price: fallback.price,
          change_pct: fallback.changePct,
          volume: fallback.volume,
          pe_ratio: fallback.peRatio,
          dividend_yield: fallback.dividendYield,
          fetched_at: new Date().toISOString(),
        }
      : null);

    const intraday = ((intradayRes.data ?? []) as StockPriceHistory[]).map((row, index) => ({
      id: index,
      ticker,
      price: Number(row.price),
      recorded_at: row.recorded_at,
    }));
    const daily = ((dailyRes.data ?? []) as DailyHistoryRow[]).map((row, index) => ({
      id: index + 100000,
      ticker,
      price: Number(row.close),
      recorded_at: row.date,
    })) satisfies StockPriceHistory[];

    const oldestIntraday = intraday.length > 0
      ? new Date(intraday[intraday.length - 1].recorded_at)
      : new Date();
    const dailyFiltered = daily.filter((row) => row.recorded_at && new Date(row.recorded_at) < oldestIntraday);
    const history = [...intraday, ...dailyFiltered].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    return {
      company,
      price,
      history,
      events: (eventsRes.data ?? []) as EventRow[],
    };
  } catch {
    return {
      company: canonical,
      price: fallback
        ? {
            ticker,
            price: fallback.price,
            change_pct: fallback.changePct,
            volume: fallback.volume,
            pe_ratio: fallback.peRatio,
            dividend_yield: fallback.dividendYield,
            fetched_at: new Date().toISOString(),
          }
        : null,
      history: [],
      events: [],
    };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const data = await getFictionalStockData(ticker.toUpperCase());
  if (!data) return { title: ticker };
  return {
    title: `${data.company.name} (${ticker.toUpperCase()}) Fictional Stock`,
    description: `${data.company.name} fictional market quote, chart, valuation, and events.`,
  };
}

export default async function FictionalStockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const data = await getFictionalStockData(ticker.toUpperCase());
  if (!data) notFound();

  const { company, price, history, events } = data;
  const isUp = (price?.change_pct ?? 0) >= 0;

  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="mb-5">
        <Link href="/fictional-market" className="nav-link text-xs">
          Back to Fictional Market
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <FictionalTickerMark ticker={company.ticker} color={company.color} accent={company.accent} size="lg" />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate" style={{ color: "var(--text)" }}>
                  {company.name}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {[company.ticker, company.exchange, company.sector, company.source].join(" · ")}
                </p>
              </div>
            </div>
            <span className={`badge ${riskClass(company.risk)}`}>{company.risk}</span>
          </div>

          {price && (
            <section className="card rounded-xl p-5">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-4xl font-bold" style={{ color: "var(--text)" }}>
                  ${Number(price.price).toFixed(2)}
                </span>
                <span
                  className="text-base font-semibold px-2 py-0.5 rounded-lg"
                  style={{
                    color: isUp ? "var(--up)" : "var(--down)",
                    background: isUp ? "var(--up-dim)" : "var(--down-dim)",
                  }}
                >
                  {isUp ? "+" : ""}{Number(price.change_pct).toFixed(2)}%
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
                Vol {formatVolume(Number(price.volume))} · Fictional quote · as of {new Date(price.fetched_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                })} ET
              </p>
            </section>
          )}

          <StockChart
            ticker={company.ticker}
            history={history}
            currentPrice={price ? { price: Number(price.price), fetched_at: price.fetched_at } : null}
          />

          <section className="card rounded-xl p-5">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Latest fictional tape</h2>
            <div className="mt-4 space-y-3">
              {events.length > 0 ? events.map((event) => (
                <div key={`${event.event_at}-${event.headline}`} className="pb-3 last:pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="badge badge-muted">{event.severity}</span>
                    <span className="text-xs font-semibold" style={{ color: Number(event.impact_pct) >= 0 ? "var(--up)" : "var(--down)" }}>
                      {Number(event.impact_pct) >= 0 ? "+" : ""}{Number(event.impact_pct).toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--text-2)" }}>{event.headline}</p>
                </div>
              )) : (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>No ticker-specific events yet.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Overview</p>
            {[
              ["Market cap", formatFictionalMarketCap(company.marketCap)],
              ["Float", formatVolume(company.floatShares)],
              ["Influence", `${company.influence}/100`],
              ["Technology", `${company.technology}/100`],
              ["Volatility", `${company.volatility.toFixed(1)}x`],
              ["P/E", price?.pe_ratio == null ? "-" : Number(price.pe_ratio).toFixed(1)],
              ["Dividend", price?.dividend_yield == null ? "-" : `${Number(price.dividend_yield).toFixed(2)}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-start gap-3">
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
                <span className="text-xs font-medium text-right" style={{ color: "var(--text)" }}>{value}</span>
              </div>
            ))}
          </section>

          <section className="card rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Thesis</p>
            <p className="text-xs leading-relaxed mt-3" style={{ color: "var(--text-2)" }}>{company.note}</p>
          </section>

          <section className="card rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Chart data</p>
            <p className="text-xs leading-relaxed mt-3" style={{ color: "var(--text-2)" }}>
              Intraday points roll for 30 days. Daily OHLCV rolls for 366 days, matching the real stock chart retention model.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
