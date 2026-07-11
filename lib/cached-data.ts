import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StockPrice, Stock } from "@/lib/types";

export type StockPriceWithStock = StockPrice & { stocks: Stock };

/**
 * Per-request dedup of stock_prices joined with stocks.
 * React.cache() ensures this runs at most once per server render,
 * so SectorWidget + MarketStatsWidget + getMovers() share one query.
 */
export const getAllStockPrices = cache(
  async (): Promise<StockPriceWithStock[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("stock_prices")
      .select("*, stocks(*)");
    // Retired symbols remain in the database for watchlist and paper-trading
    // history, but should not affect the public market overview.
    return ((data as StockPriceWithStock[]) ?? []).filter((row) => row.stocks?.is_active !== false);
  }
);
