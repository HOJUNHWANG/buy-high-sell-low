"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { getMarketHeatmap, heatmapQuoteTimeFormat, type HeatmapLayout, type HeatmapStock } from "@/lib/market-heatmap";
import styles from "./heatmap.module.css";

const changeFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const marketCapFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const colorLimit = 5;
const percent = (value: number) => `${(value * 100).toFixed(4)}%`;
const formatChange = (change: number | null) => change === null ? "—" : `${changeFormat.format(change)}%`;

function tilePosition({ desktop, mobile }: HeatmapLayout): CSSProperties {
  return {
    "--tile-x": percent(desktop.x),
    "--tile-y": percent(desktop.y),
    "--tile-width": percent(desktop.width),
    "--tile-height": percent(desktop.height),
    "--mobile-x": percent(mobile.x),
    "--mobile-y": percent(mobile.y),
    "--mobile-width": percent(mobile.width),
    "--mobile-height": percent(mobile.height),
  } as CSSProperties;
}

export function StockHeatmap({ stocks }: { stocks: HeatmapStock[] }) {
  const { groups, withoutMarketCap } = getMarketHeatmap(stocks);

  return (
    <>
      {groups.length > 0 ? (
        <figure>
          <figcaption className={styles.legend}>
            <span>Tile size by market cap</span>
            <div className={styles.scale}>
              <span>Daily change</span>
              <div>
                <div className={styles.swatches} aria-hidden="true" />
                <div className={styles.scaleLabels}><span>−{colorLimit}%</span><span>0%</span><span>+{colorLimit}%</span></div>
              </div>
            </div>
            <span className={styles.unavailableKey}>No change data</span>
          </figcaption>

          <div className={styles.board}>
            {groups.map((sector) => (
              <section key={sector.name} aria-label={sector.name} className={`${styles.positioned} ${styles.sector}`} style={tilePosition(sector)}>
                <h2 className={styles.sectorHeading} title={sector.name}>{sector.name}</h2>
                <div className={styles.sectorTiles}>
                  {sector.stocks.map((tile) => {
                    const { ticker, name, change, weight, quotedAt } = tile.item;
                    const changeText = formatChange(change);
                    const description = `${name} (${ticker}) · ${change === null ? "Daily change unavailable" : `${changeText} daily`} · ${marketCapFormat.format(weight)} market cap`;

                    return (
                      <Link
                        key={ticker}
                        href={`/stock/${encodeURIComponent(ticker)}`}
                        prefetch={false}
                        className={`${styles.positioned} ${styles.tile}`}
                        data-move={change === null ? "unavailable" : change < 0 ? "down" : "up"}
                        style={{
                          ...tilePosition(tile),
                          "--move-strength": `${Math.min(Math.abs(change ?? 0) / colorLimit, 1) * 100}%`,
                        } as CSSProperties}
                        aria-label={description}
                        title={quotedAt == null ? description : `${description} · Quote received ${heatmapQuoteTimeFormat.format(quotedAt)}`}
                      >
                        <span className={styles.tileLabel} aria-hidden="true">
                          <strong className={styles.ticker}>{ticker}</strong>
                          <span className={styles.company}>{name}</span>
                          <span className={styles.change}>{changeText}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </figure>
      ) : (
        <p className={styles.empty}>
          {stocks.length ? "The heatmap will appear when market caps are available." : "No stocks are available yet."}
        </p>
      )}

      {withoutMarketCap.length > 0 && (
        <section className={styles.missingCaps} aria-labelledby="heatmap-missing-cap">
          <h2 id="heatmap-missing-cap">Market cap unavailable</h2>
          <ul>
            {withoutMarketCap.map(({ ticker, name, change }) => (
              <li key={ticker}>
                <Link href={`/stock/${encodeURIComponent(ticker)}`} prefetch={false} title={name}>
                  <strong>{ticker}</strong> <span>{formatChange(change)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
