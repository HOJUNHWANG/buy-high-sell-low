"use client";

import { useEffect, useRef, useState } from "react";
import type { StockPriceHistory } from "@/lib/types";

interface Props {
  ticker: string;
  history: StockPriceHistory[];
}

type Range = "1D" | "1W" | "1M" | "3M";

function filterByRange(data: StockPriceHistory[], range: Range): StockPriceHistory[] {
  const now = Date.now();
  const ms: Record<Range, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
    "3M": 90 * 24 * 60 * 60 * 1000,
  };
  return data.filter((d) => new Date(d.recorded_at).getTime() >= now - ms[range]);
}

function getRangeStats(data: StockPriceHistory[]) {
  if (data.length === 0) return null;
  const prices = data.map((d) => d.price);
  const low    = Math.min(...prices);
  const high   = Math.max(...prices);
  const first  = data[0].price;
  const last   = data[data.length - 1].price;
  const change = last - first;
  const changePct = (change / first) * 100;
  return { low, high, first, last, change, changePct };
}

export function StockChart({ ticker, history }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("1W");
  const ranges: Range[]   = ["1D", "1W", "1M", "3M"];

  const filtered = filterByRange(history, range);
  const stats    = getRangeStats(filtered);
  const isUp     = (stats?.changePct ?? 0) >= 0;

  useEffect(() => {
    if (!chartRef.current || history.length === 0) return;
    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]> | null = null;

    async function init() {
      const { createChart, ColorType, AreaSeries } = await import("lightweight-charts");
      if (!chartRef.current) return;

      const accentColor = isUp ? "#4ade80" : "#f87171";

      chart = createChart(chartRef.current, {
        width:  chartRef.current.clientWidth,
        height: 280,
        layout: {
          background: { type: ColorType.Solid, color: "#0f0f0f" },
          textColor:  "#555",
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
          textColor:   "#555",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor:        accentColor,
        topColor:         `${accentColor}28`,
        bottomColor:      `${accentColor}00`,
        lineWidth:        2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        crosshairMarkerBackgroundColor: accentColor,
      });

      const filteredData = filterByRange(history, range);
      const points = filteredData
        .map((d) => ({
          time:  Math.floor(new Date(d.recorded_at).getTime() / 1000) as number,
          value: d.price,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      // Remove duplicate timestamps
      const deduped = points.filter((p, i) => i === 0 || p.time !== points[i - 1].time);

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
    return () => { chart?.remove(); };
  }, [history, range, isUp]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Range tabs + stats */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all"
              style={{
                background: range === r ? "var(--accent)"      : "transparent",
                color:      range === r ? "#fff"               : "var(--text-2)",
              }}
            >
              {r}
            </button>
          ))}
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
              {isUp ? "+" : ""}{stats.changePct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div
          className="h-64 flex flex-col items-center justify-center gap-2 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" opacity="0.3">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
          </svg>
          Chart data unavailable
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="h-64 flex flex-col items-center justify-center gap-1.5 text-xs text-center px-6"
          style={{ color: "var(--text-3)" }}
        >
          <span>No data for {range}</span>
          {range === "1D" && (
            <span style={{ color: "var(--text-3)", fontSize: "10px" }}>
              Intraday data is collected during market hours (9:30 AM – 4:00 PM ET, Mon–Fri)
            </span>
          )}
          {range !== "1D" && range !== "3M" && (
            <span style={{ color: "var(--text-3)", fontSize: "10px" }}>
              Try a wider range
            </span>
          )}
          {range === "3M" && (
            <span style={{ color: "var(--text-3)", fontSize: "10px" }}>
              No data available for this period
            </span>
          )}
        </div>
      ) : (
        <div ref={chartRef} className="w-full" style={{ touchAction: "pan-y" }} />
      )}
    </div>
  );
}
