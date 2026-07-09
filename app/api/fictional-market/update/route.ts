import { NextRequest, NextResponse } from "next/server";
import { fictionalCompanies } from "@/data/fictional-market";
import { priceFictionalCompany } from "@/lib/fictional-market-engine";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type ExistingPrice = {
  ticker: string;
  price: number;
  change_pct: number | null;
};

type ExistingDaily = {
  ticker: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function cronAuthorized(request: NextRequest) {
  const configuredSecret = process.env.FICTIONAL_MARKET_CRON_SECRET;
  if (!configuredSecret) return false;

  const querySecret = request.nextUrl.searchParams.get("secret");
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return [querySecret, headerSecret, bearerSecret].some((secret) => secret === configuredSecret);
}

function companyRow(company: (typeof fictionalCompanies)[number], marketCap: number) {
  return {
    ticker: company.ticker,
    name: company.name,
    source: company.source,
    exchange: company.exchange,
    sector: company.sector,
    risk: company.risk,
    market_cap: marketCap,
    base_price: company.basePrice,
    float_shares: company.floatShares,
    volatility: company.volatility,
    influence: company.influence,
    technology: company.technology,
    color: company.color,
    accent: company.accent,
    note: company.note,
    updated_at: new Date().toISOString(),
  };
}

async function updateFictionalMarket(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized fictional market cron request" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const now = new Date();
  const sample = priceFictionalCompany({ company: fictionalCompanies[0], now });
  const marketDate = sample.marketDate;

  const tickers = fictionalCompanies.map((company) => company.ticker);
  const [{ data: previousPrices }, { data: dailyRows }] = await Promise.all([
    supabase
      .from("fictional_prices")
      .select("ticker, price, change_pct")
      .in("ticker", tickers),
    supabase
      .from("fictional_price_history_daily")
      .select("ticker, open, high, low, close, volume")
      .eq("date", marketDate)
      .in("ticker", tickers),
  ]);

  const priceMap = new Map((previousPrices as ExistingPrice[] | null ?? []).map((row) => [row.ticker, row]));
  const dailyMap = new Map((dailyRows as ExistingDaily[] | null ?? []).map((row) => [row.ticker, row]));
  const outputs = fictionalCompanies.map((company) => priceFictionalCompany({
    company,
    now,
    existingPrice: priceMap.get(company.ticker) ?? null,
    existingDaily: dailyMap.get(company.ticker) ?? null,
  }));

  const companyRows = fictionalCompanies.map((company) => {
    const output = outputs.find((item) => item.ticker === company.ticker);
    return companyRow(company, output?.marketCap ?? company.marketCap);
  });
  const priceRows = outputs.map((output) => ({
    ticker: output.ticker,
    ...output.price,
    fetched_at: now.toISOString(),
  }));
  const historyRows = outputs.map((output) => ({
    ticker: output.ticker,
    recorded_at: now.toISOString(),
    price: output.price.price,
    change_pct: output.price.change_pct,
    volume: output.price.volume,
  }));
  const dailyUpserts = outputs.map((output) => ({
    ticker: output.ticker,
    date: output.marketDate,
    ...output.daily,
  }));
  const eventRows = outputs
    .sort((a, b) => Math.abs(b.price.change_pct) - Math.abs(a.price.change_pct))
    .slice(0, 12)
    .map((output) => ({
      event_key: `${output.marketDate}:${output.ticker}`,
      ticker: output.ticker,
      headline: output.event.headline,
      impact_pct: output.event.impactPct,
      severity: output.event.severity,
      event_at: now.toISOString(),
    }));

  await supabase.from("fictional_companies").upsert(companyRows, { onConflict: "ticker" }).throwOnError();
  await supabase.from("fictional_prices").upsert(priceRows, { onConflict: "ticker" }).throwOnError();
  await supabase.from("fictional_price_history").insert(historyRows).throwOnError();
  await supabase.from("fictional_price_history_daily").upsert(dailyUpserts, { onConflict: "ticker,date" }).throwOnError();
  await supabase.from("fictional_market_events").upsert(eventRows, { onConflict: "event_key" }).throwOnError();
  await supabase.rpc("cleanup_fictional_market_data").throwOnError();

  const totalMarketCap = outputs.reduce((sum, output) => sum + output.marketCap, 0);
  const weightedChangePct = outputs.reduce((sum, output) => sum + output.marketCap * output.price.change_pct, 0) / totalMarketCap;

  return NextResponse.json({
    ok: true,
    marketDate,
    companies: companyRows.length,
    prices: priceRows.length,
    events: eventRows.length,
    totalMarketCap,
    weightedChangePct: Number(weightedChangePct.toFixed(2)),
    updatedAt: now.toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return updateFictionalMarket(request);
}

export async function POST(request: NextRequest) {
  return updateFictionalMarket(request);
}
