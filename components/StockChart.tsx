"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { StockPriceHistory } from "@/lib/types";
import { useAdBlocked } from "@/components/AdBlockDetector";

interface Props {
  ticker: string;
  history: StockPriceHistory[];
  isCrypto?: boolean;
  /** Latest current price + timestamp to ensure chart always shows most recent data */
  currentPrice?: { price: number; fetched_at: string } | null;
}

type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

const RANGE_MS: Record<Range, number> = {
  "1D": 1 * 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  "6M": 180 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
};

function filterByRange(data: StockPriceHistory[], range: Range): StockPriceHistory[] {
  const now = Date.now();
  return data.filter((d) => new Date(d.recorded_at).getTime() >= now - RANGE_MS[range]);
}

/**
 * Aggregate data points to reduce noise on longer timeframes.
 * - 1D: raw points (intraday 15-min)
 * - 1W: one point per hour
 * - 1M+: one point per day (last price of that day)
 */
function aggregateData(
  data: { time: number; value: number }[],
  range: Range
): { time: number; value: number }[] {
  if (data.length === 0) return [];
  if (range === "1D") return data; // raw intraday

  const bucketSize =
    range === "1W"
      ? 60 * 60 // 1 hour
      : 24 * 60 * 60; // 1 day for 1M/3M/6M/1Y

  const buckets = new Map<number, { time: number; value: number }>();
  for (const point of data) {
    const key = Math.floor(point.time / bucketSize) * bucketSize;
    // Keep last value per bucket (most recent price)
    buckets.set(key, { time: key, value: point.value });
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
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

const FREE_RANGES: Range[] = ["1D", "1W"];
const LOCKED_RANGES: Range[] = ["1M", "3M", "6M", "1Y"];

export function StockChart({ ticker, history, isCrypto, currentPrice }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const adBlocked = useAdBlocked();
  const [range, setRange] = useState<Range>(adBlocked ? "1W" : "1M");
  const [chartError, setChartError] = useState(false);
  const allRanges: Range[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

  // Reset to allowed range if ad blocker kicks in while on a locked range
  useEffect(() => {
    if (adBlocked && LOCKED_RANGES.includes(range)) {
      setRange("1W");
    }
  }, [adBlocked, range]);

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

  const filtered = useMemo(() => filterByRange(historyWithCurrent, range), [historyWithCurrent, range]);
  const stats = useMemo(() => getRangeStats(filtered), [filtered]);
  const isUp = (stats?.changePct ?? 0) >= 0;

  useEffect(() => {
    if (!chartRef.current || historyWithCurrent.length === 0) return;
    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]> | null = null;

    async function init() {
      let createChart, ColorType, AreaSeries;
      try {
        ({ createChart, ColorType, AreaSeries } = await import("lightweight-charts"));
      } catch {
        setChartError(true);
        return;
      }
      if (!chartRef.current) return;

      const accentColor = isUp ? "#4ade80" : "#f87171";

      // Show time (HH:MM) only for intraday views
      const showTime = range === "1D" || range === "1W";

      chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 280,
        layout: {
          background: { type: ColorType.Solid, color: "#0f0f0f" },
          textColor: "#555",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.02)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1c1c1c" },
          horzLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1c1c1c" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          textColor: "#555",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: showTime,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          rightOffset: 2,
          tickMarkFormatter: showTime
            ? undefined
            : (time: number) => {
                const d = new Date(time * 1000);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              },
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
      });

      const filteredData = filterByRange(historyWithCurrent, range);
      const rawPoints = filteredData
        .map((d) => ({
          time: Math.floor(new Date(d.recorded_at).getTime() / 1000) as number,
          value: d.price,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      // Aggregate based on range to reduce noise
      const aggregated = aggregateData(rawPoints, range);

      // Remove duplicate timestamps
      const deduped = aggregated.filter((p, i) => i === 0 || p.time !== aggregated[i - 1].time);

      areaSeries.setData(deduped as Parameters<typeof areaSeries.setData>[0]);
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chart && chartRef.current)
          chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    init();
    return () => {
      chart?.remove();
    };
  }, [historyWithCurrent, range, isUp]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Range tabs + stats */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1">
          {allRanges.map((r) => {
            const locked = adBlocked && LOCKED_RANGES.includes(r);
            return (
              <button
                key={r}
                onClick={() => !locked && setRange(r)}
                disabled={locked}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all"
                style={{
                  background: range === r ? "var(--accent)" : "transparent",
                  color: locked ? "var(--text-3)" : range === r ? "#fff" : "var(--text-2)",
                  opacity: locked ? 0.5 : 1,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
                title={locked ? "Disable ad blocker to unlock" : undefined}
              >
                {r}
                {locked && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" className="inline ml-0.5 -mt-0.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Range summary */}
        {stats && (
          <div className="flex items-center gap-3 text-[11px]">
            <span style={{ color: "var(--text-3)" }}>
              H: <span style={{ color: "var(--text-2)" }}>${stats.high.toFixed(2)}</span>
            </span>
            <span style={{ color: "var(--text-3)" }}>
              L: <span style={{ color: "var(--text-2)" }}>${stats.low.toFixed(2)}</span>
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

      {chartError ? (
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
      ) : (
        <div ref={chartRef} className="w-full" style={{ touchAction: "pan-y" }} />
      )}

      {/* Data resolution note */}
      <div className="px-4 py-2 text-[10px] text-center italic" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
        Intraday data (5m) for the last 30 days, daily close for earlier dates.
      </div>
    </div>
  );
}
