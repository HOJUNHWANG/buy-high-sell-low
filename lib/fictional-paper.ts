import { fictionalCompanies } from "@/data/fictional-market";

export const FICTIONAL_STARTING_CASH = 1000;
export const FICTIONAL_QUOTE_MAX_AGE_MS = 90 * 60 * 1000;
const tickers = new Set(fictionalCompanies.map((company) => company.ticker));

export type FictionalOrder = {
  ticker: string;
  side: "buy" | "sell";
  unit: "dollars" | "shares" | "all";
  amount: number;
  requestId: string;
};

export function parseFictionalOrder(body: unknown): FictionalOrder | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const ticker = typeof row.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
  if (!tickers.has(ticker) || (row.side !== "buy" && row.side !== "sell")) return null;
  if (typeof row.unit !== "string" || !["dollars", "shares", "all"].includes(row.unit)) return null;
  if (row.unit === "all" && row.side !== "sell") return null;
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount > 1e12) return null;
  if (row.unit === "all" ? row.amount !== 0 : row.amount <= 0) return null;
  if (typeof row.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.requestId)) return null;
  return { ticker, side: row.side, unit: row.unit as FictionalOrder["unit"], amount: row.amount, requestId: row.requestId };
}

export type FictionalQuote = {
  ticker: string;
  price: number;
  change_pct: number;
  fetched_at: string;
};

export function isFictionalQuoteFresh(quote: FictionalQuote | undefined, now = Date.now()): boolean {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return false;
  const age = now - Date.parse(quote.fetched_at);
  return Number.isFinite(age) && age >= -60_000 && age <= FICTIONAL_QUOTE_MAX_AGE_MS;
}

export type FictionalPosition = { ticker: string; shares: number; avg_cost: number };

export function valueFictionalPortfolio(cashBalance: number, positions: FictionalPosition[], quotes: FictionalQuote[]) {
  const byTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
  const valuedPositions = positions.map((position) => {
    const quote = byTicker.get(position.ticker);
    const currentPrice = quote && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
    const marketValue = currentPrice === null ? null : position.shares * currentPrice;
    const costBasis = position.shares * position.avg_cost;
    const pnl = marketValue === null ? null : marketValue - costBasis;
    return {
      ...position, currentPrice, marketValue, costBasis, pnl,
      pnlPct: pnl === null || costBasis <= 0 ? null : pnl / costBasis * 100,
      fetchedAt: quote?.fetched_at ?? null,
    };
  });
  const totalMarketValue = valuedPositions.some((position) => position.marketValue === null)
    ? null : valuedPositions.reduce((total, position) => total + position.marketValue!, 0);
  const totalValue = totalMarketValue === null ? null : cashBalance + totalMarketValue;
  const pnl = totalValue === null ? null : totalValue - FICTIONAL_STARTING_CASH;
  return {
    cashBalance, positions: valuedPositions, totalMarketValue, totalValue,
    totalPnl: pnl, totalPnlPct: pnl === null ? null : pnl / FICTIONAL_STARTING_CASH * 100,
  };
}

export type FictionalPortfolio = ReturnType<typeof valueFictionalPortfolio> & { quotes: FictionalQuote[] };
export type FictionalTransaction = {
  id: number; ticker: string; side: "buy" | "sell"; shares: number;
  price: number; total: number; realized_pnl: number; executed_at: string;
  cash_balance_after: number; price_fetched_at: string;
};
export type FictionalRanking = {
  rank: number; name: string; totalValue: number; pnl: number; pnlPct: number; isMe: boolean;
};
