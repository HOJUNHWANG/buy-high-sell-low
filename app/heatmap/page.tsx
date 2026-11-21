import type { Metadata } from "next";
import { connection } from "next/server";
import { LiveDataRefresh } from "@/components/LiveDataRefresh";
import { getMarketSnapshot } from "@/lib/cached-data";
import { getHeatmapStocks, heatmapQuoteTimeFormat } from "@/lib/market-heatmap";
import { getMarketStatus } from "@/lib/market-hours";
import { StockHeatmap } from "./StockHeatmap";
import styles from "./heatmap.module.css";

export const metadata: Metadata = {
  title: "Stock Heatmap",
  description: "Explore tracked US stocks by sector, market cap, and daily price change.",
};

export default async function HeatmapPage() {
  await connection();
  const { stocks, latestQuote } = getHeatmapStocks(await getMarketSnapshot());
  const now = new Date();
  const { isOpen } = getMarketStatus(now);

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
      <LiveDataRefresh renderedAt={now.getTime()} />
      <header className={`page-header ${styles.header}`}>
        <div>
          <h1 className={styles.title}>Stock Heatmap</h1>
          <p className={styles.subtitle}>Daily moves across {stocks.length} tracked US {stocks.length === 1 ? "stock" : "stocks"}.</p>
        </div>
        <div className={styles.quoteStatus}>
          <span className={styles.marketStatus} data-open={isOpen}>
            {isOpen ? "Market open" : "Market closed"}
          </span>
          {latestQuote != null && (
            <span>Latest quote <time dateTime={new Date(latestQuote).toISOString()}>{heatmapQuoteTimeFormat.format(latestQuote)}</time></span>
          )}
        </div>
      </header>

      <StockHeatmap stocks={stocks} />
    </div>
  );
}
