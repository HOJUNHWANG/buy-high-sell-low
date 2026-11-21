"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { Time, UTCTimestamp } from "lightweight-charts";
import type { StockPriceHistory } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import { useDesign } from "@/components/DesignProvider";
import { assetPriceFractionDigits, formatAssetPrice } from "@/lib/price-format";

interface Props {
  ticker: string;
  history: StockPriceHistory[];
  renderedAt: number;
  isCrypto?: boolean;
  /** Latest current price + timestamp to ensure chart always shows most recent data */
  currentPrice?: { price: number; fetched_at: string } | null;
}

type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";
type ChartPoint = { time: UTCTimestamp; value: number; isDaily: boolean };

const dateOptions = { month: "short", day: "numeric" } as const;
const utcDate = new Intl.DateTimeFormat("en-US", { ...dateOptions, timeZone: "UTC" });

const RANGE_MS: Record<Range, number> = {
  "1D": 1 * 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  "6M": 180 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
};

function filterByRange(data: StockPriceHistory[], range: Range, renderedAt: number): StockPriceHistory[] {
  const cutoff = renderedAt - RANGE_MS[range];
  return data.filter((point) => Date.parse(point.recorded_at) >= cutoff);
}

/**
 * Aggregate data points to reduce noise on longer timeframes.
 * - 1D: raw observations
 * - 1W: last observation per hour, at its actual timestamp
 * - 1M+: one point per day (last price of that day)
 */
function aggregateData(data: ChartPoint[], range: Range): ChartPoint[] {
  if (range === "1D") return data;

  const weekly = range === "1W";
  const bucketSize = weekly ? 3600 : 86_400;
  const buckets = new Map<number, ChartPoint>();
  for (const point of data) {
    const key = Math.floor(point.time / bucketSize) * bucketSize;
    buckets.set(key, weekly ? point : { ...point, time: key as UTCTimestamp });
  }

  return [...buckets.values()];
}

function formatDailyTick(time: Time) {
  return typeof time === "number" ? utcDate.format(new Date(time * 1000)) : null;
}

function weeklyTimeFormatters(data: ChartPoint[], isCrypto?: boolean) {
  const timeZone = isCrypto ? "UTC" : "America/New_York";
  const sessionDate = isCrypto ? utcDate : new Intl.DateTimeFormat("en-US", { ...dateOptions, timeZone });
  const observationTime = new Intl.DateTimeFormat("en-US", {
    ...dateOptions, timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const ticks = new Map<number, string>();
  const closes = new Map<number, string>();
  let previousDate = "";
  for (const { time, isDaily } of data) {
    const date = new Date(time * 1000);
    const label = (isDaily ? utcDate : sessionDate).format(date);
    if (label !== previousDate) ticks.set(time, label);
    if (isDaily) closes.set(time, `${label} close`);
    previousDate = label;
  }
  return {
    tickMarkFormatter: (time: Time) => typeof time === "number" ? ticks.get(time) ?? "" : null,
    timeFormatter: (time: Time) => typeof time === "number"
      ? closes.get(time) ?? observationTime.format(new Date(time * 1000))
      : String(time),
  };
}

function getRangeStats(data: StockPriceHistory[]) {
  if (data.length === 0) return null;
  const prices = data.map((d) => d.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Data comes in DESC order (newest first), so sort by time to get chronological
  const sorted = [...data].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const oldest = sorted[0].price;
  const newest = sorted[sorted.length - 1].price;
  const change = newest - oldest;
  const changePct = oldest > 0 ? (change / oldest) * 100 : 0;
  return { low, high, first: oldest, last: newest, change, changePct };
}

export function StockChart({ ticker, history, renderedAt, isCrypto, currentPrice }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { design } = useDesign();
  const [range, setRange] = useState<Range>("1M");
  const [chartError, setChartError] = useState(false);
  const allRanges: Range[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

  // Merge current price into history to ensure chart always shows latest data
  const historyWithCurrent = useMemo(() => {
    if (!currentPrice) return history;
    const currentTs = new Date(currentPrice.fetched_at).getTime();
    // Only add if it's newer than the newest history point
    const newest = history.length > 0
      ? Math.max(...history.map((h) => new Date(h.recorded_at).getTime()))
      : 0;
    if (currentTs <= newest) return history;
    return [
      ...history,
      {
        id: -1,
        ticker,
        price: currentPrice.price,
        recorded_at: currentPrice.fetched_at,
      } satisfies StockPriceHistory,
    ];
  }, [history, currentPrice, ticker]);

  const filtered = useMemo(() => filterByRange(historyWithCurrent, range, renderedAt), [historyWithCurrent, range, renderedAt]);
  const seriesData = useMemo(() => {
    const points = filtered.map(({ recorded_at, price }) => ({
      time: Math.floor(Date.parse(recorded_at) / 1000) as UTCTimestamp,
      value: price,
      isDaily: recorded_at.length === 10,
    })).sort((a, b) => a.time - b.time);
    const aggregated = aggregateData(points, range);
    return aggregated.filter((point, index) => index === 0 || point.time !== aggregated[index - 1].time);
  }, [filtered, range]);
  const hasChart = seriesData.length >= 2;
  const stats = useMemo(() => getRangeStats(filtered), [filtered]);
  const isUp = (stats?.changePct ?? 0) >= 0;
  const priceDigits = assetPriceFractionDigits(stats?.last ?? currentPrice?.price ?? 0, ticker);

  useEffect(() => {
    const container = chartRef.current;
    if (!container || !hasChart) return;
    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]> | null = null;
    let observer: ResizeObserver | undefined;
    let disposed = false;

    async function init(container: HTMLDivElement) {
      let createChart, ColorType, AreaSeries;
      try {
        ({ createChart, ColorType, AreaSeries } = await import("lightweight-charts"));
      } catch {
        if (!disposed) setChartError(true);
        return;
      }
      if (disposed) return;

      const styles = getComputedStyle(document.documentElement);
      const themeColor = (name: string) => styles.getPropertyValue(name).trim();
      const accentColor = isUp ? themeColor("--up") : themeColor("--down");
      const chartSurface = themeColor("--surface");
      const chartText = themeColor("--text-3");
      const chartGrid = themeColor("--border");
      const chartLine = themeColor("--border-lg");
      const chartLabel = themeColor("--surface-3");

      // Show time (HH:MM) only for intraday views
      const showTime = range === "1D" || range === "1W";
      const weekly = range === "1W" ? weeklyTimeFormatters(seriesData, isCrypto) : null;

      chart = createChart(container, {
        width: container.clientWidth,
        height: 280,
        layout: {
          background: { type: ColorType.Solid, color: chartSurface },
          textColor: chartText,
        },
        grid: {
          vertLines: { color: chartGrid },
          horzLines: { color: chartGrid },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: chartLine, labelBackgroundColor: chartLabel },
          horzLine: { color: chartLine, labelBackgroundColor: chartLabel },
        },
        rightPriceScale: {
          borderColor: chartGrid,
          textColor: chartText,
        },
        localization: weekly ? { timeFormatter: weekly.timeFormatter } : {},
        timeScale: {
          borderColor: chartGrid,
          timeVisible: showTime,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          rightOffset: 2,
          tickMarkFormatter: weekly?.tickMarkFormatter ?? (showTime ? undefined : formatDailyTick),
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: accentColor,
        topColor: `${accentColor}28`,
        bottomColor: `${accentColor}00`,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: accentColor,
        priceFormat: {
          type: "price",
          precision: priceDigits,
          minMove: 10 ** -priceDigits,
        },
      });

      areaSeries.setData(seriesData);
      chart.timeScale().fitContent();

      observer = new ResizeObserver(() => chart?.applyOptions({ width: container.clientWidth }));
      observer.observe(container);
    }

    void init(container);
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.remove();
    };
  }, [hasChart, seriesData, range, isCrypto, isUp, priceDigits, theme, design]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Range tabs + stats */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-1">
          {allRanges.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all"
                style={{
                  background: range === r ? "var(--accent)" : "transparent",
                  color: range === r ? "var(--on-accent)" : "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
          ))}
        </div>

        {/* Range summary */}
        {hasChart && stats && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="whitespace-nowrap" style={{ color: "var(--text-3)" }}>
              H: <span style={{ color: "var(--text-2)" }}>{formatAssetPrice(stats.high, ticker)}</span>
            </span>
            <span className="whitespace-nowrap" style={{ color: "var(--text-3)" }}>
              L: <span style={{ color: "var(--text-2)" }}>{formatAssetPrice(stats.low, ticker)}</span>
            </span>
            <span
              className="font-semibold"
              style={{ color: isUp ? "var(--up)" : "var(--down)" }}
            >
              {isUp ? "+" : ""}
              {stats.changePct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {hasChart && chartError ? (
        <div
          className="h-64 flex flex-col items-center justify-center gap-2 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          Chart failed to load
        </div>
      ) : historyWithCurrent.length === 0 ? (
        <div
          className="h-64 flex flex-col items-center justify-center gap-2 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            opacity="0.3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16"
            />
          </svg>
          Chart data unavailable
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="h-64 flex flex-col items-center justify-center gap-1.5 text-xs text-center px-6"
          style={{ color: "var(--text-3)" }}
        >
          <span>No data for {range}</span>
          {range === "1D" && !isCrypto && (
            <span style={{ color: "var(--text-3)", fontSize: "10px" }}>
              Intraday data is collected during market hours (9:30 AM – 4:00 PM ET, Mon–Fri)
            </span>
          )}
          {(range !== "1D" || isCrypto) && (
            <span style={{ color: "var(--text-3)", fontSize: "10px" }}>
              Try a wider range or wait for more data to be collected
            </span>
          )}
        </div>
      ) : !hasChart ? (
        <p className="h-64 grid place-items-center px-6 text-center text-xs" style={{ color: "var(--text-3)" }}>
          Only one price point is available for {range}.
        </p>
      ) : (
        <div ref={chartRef} className="w-full" style={{ touchAction: "pan-y", height: 280 }} />
      )}

      {/* Data resolution note */}
      {hasChart && !chartError && (
        <div className="px-4 py-2 text-[10px] text-center italic" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
          {range === "1W"
            ? `Hourly samples where available · ${isCrypto ? "UTC" : "U.S. Eastern time"}`
            : "Intraday data (5m) for the last 30 days, daily close for earlier dates."}
        </div>
      )}
    </div>
  );
}
