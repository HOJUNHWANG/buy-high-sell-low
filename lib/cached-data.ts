import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StockPrice, Stock } from "@/lib/types";

export type StockPriceWithStock = StockPrice & { stocks: Stock };

/**
 * Cached fetch of all stock_prices joined with stocks.
 * Revalidates every 300s (matches the 5-min cron interval).
 * Shared by: getMovers(), SectorWidget, MarketStatsWidget.
 */
export const getAllStockPrices = unstable_cache(
  async (): Promise<StockPriceWithStock[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("stock_prices")
      .select("*, stocks(*)");
    return (data as StockPriceWithStock[]) ?? [];
  },
  ["all-stock-prices"],
  { revalidate: 300 }
);
