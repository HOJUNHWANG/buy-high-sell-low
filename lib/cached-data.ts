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
    return (data as StockPriceWithStock[]) ?? [];
  }
);
