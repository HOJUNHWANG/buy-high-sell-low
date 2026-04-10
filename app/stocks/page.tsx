import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import type { Stock, StockPrice } from "@/lib/types";
import { StockTable } from "@/components/StockTable";
import { MarketStatusWidget } from "@/components/MarketStatusWidget";
import { AdSlot } from "@/components/AdSlot";

export const metadata: Metadata = {
  title: "Screener — Stocks, ETFs & Crypto",
  description:
    "Browse S&P 100 stocks and top crypto with live prices, daily changes, and sector filters.",
};

type StockRow = Stock & { stock_prices: StockPrice | null };

export default async function StocksPage() {
  const supabase = await createSupabaseServerClient();

  // Target date: ~30 days ago, with ±3 day window for weekends/holidays
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dMin = new Date(d30.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const dMax = new Date(d30.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [{ data }, { data: hist30 }] = await Promise.all([
    supabase.from("stocks").select("*, stock_prices(*)").order("ticker"),
    supabase
      .from("price_history_long")
      .select("ticker, close, date")
      .gte("date", dMin)
      .lte("date", dMax),
  ]);

  // For each ticker, pick the entry closest to 30 days ago
  const targetTs = d30.getTime();
  const price30dMap = new Map<string, { close: number; date: string }>();
  for (const row of (hist30 ?? []) as { ticker: string; close: number; date: string }[]) {
    const existing = price30dMap.get(row.ticker);
    if (!existing) {
      price30dMap.set(row.ticker, { close: row.close, date: row.date });
    } else {
      const rowDiff = Math.abs(new Date(row.date).getTime() - targetTs);
      const existDiff = Math.abs(new Date(existing.date).getTime() - targetTs);
      if (rowDiff < existDiff) {
        price30dMap.set(row.ticker, { close: row.close, date: row.date });
      }
    }
  }

  const stocks = ((data as StockRow[] | null) ?? []).map((s) => {
    const currentPrice = s.stock_prices?.price;
    const oldPrice = price30dMap.get(s.ticker)?.close;
    const change_30d =
      currentPrice != null && oldPrice != null && oldPrice !== 0
        ? ((currentPrice - oldPrice) / oldPrice) * 100
        : null;
    return {
      ...s,
      price: s.stock_prices ?? undefined,
      change_30d,
    };
  });

  const withPrice = stocks.filter((s) => s.price).length;
  const totalUp   = stocks.filter((s) => (s.price?.change_pct ?? 0) > 0.05).length;
  const totalDown = stocks.filter((s) => (s.price?.change_pct ?? 0) < -0.05).length;

  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Stock Screener
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            S&amp;P 100 + Crypto · {stocks.length} assets · Prices updated every 5 min
          </p>
        </div>

        {/* Quick stats */}
        {withPrice > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: "var(--up-dim)",
                border: "1px solid rgba(74,222,128,0.15)",
              }}
            >
              <span style={{ color: "var(--up)" }}>▲</span>
              <span style={{ color: "var(--up)", fontWeight: 600 }}>{totalUp}</span>
              <span style={{ color: "var(--text-3)" }}>advancing</span>
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: "var(--down-dim)",
                border: "1px solid rgba(248,113,113,0.15)",
              }}
            >
              <span style={{ color: "var(--down)" }}>▼</span>
              <span style={{ color: "var(--down)", fontWeight: 600 }}>{totalDown}</span>
              <span style={{ color: "var(--text-3)" }}>declining</span>
            </div>
            <div className="hidden sm:block">
              <MarketStatusWidget />
            </div>
          </div>
        )}
      </div>

      <AdSlot slot="screener-leaderboard" format="horizontal" className="mb-4" />
      <StockTable stocks={stocks} />
    </div>
  );
}
