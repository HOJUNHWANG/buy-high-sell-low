"use client";

import { useEffect, useRef, useState } from "react";
import type { StockPriceHistory } from "@/lib/types";

interface Props {
  ticker: string;
  history: StockPriceHistory[];
}

type Range = "1D" | "1W" | "1M" | "1Y";

function filterByRange(data: StockPriceHistory[], range: Range): StockPriceHistory[] {
  const now = Date.now();
  const cutoff: Record<Range, number> = {
    "1D": now - 24 * 60 * 60 * 1000,
    "1W": now - 7 * 24 * 60 * 60 * 1000,
    "1M": now - 30 * 24 * 60 * 60 * 1000,
    "1Y": now - 365 * 24 * 60 * 60 * 1000,
  };
  return data.filter((d) => new Date(d.recorded_at).getTime() >= cutoff[range]);
}

export function StockChart({ ticker, history }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("1D");

  useEffect(() => {
    if (!chartRef.current || history.length === 0) return;

    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]> | null = null;

    async function init() {
      const { createChart, ColorType } = await import("lightweight-charts");
      if (!chartRef.current) return;

      chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 280,
        layout: {
          background: { type: ColorType.Solid, color: "#111827" },
          textColor: "#9ca3af",
        },
        grid: {
          vertLines: { color: "#1f2937" },
          horzLines: { color: "#1f2937" },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#374151" },
        timeScale: { borderColor: "#374151", timeVisible: true },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
      });

      const { LineSeries } = await import("lightweight-charts");
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
      });

      const filtered = filterByRange(history, range);
      const points = filtered.map((d) => ({
        time: Math.floor(new Date(d.recorded_at).getTime() / 1000) as number,
        value: d.price,
      }));

      lineSeries.setData(points as Parameters<typeof lineSeries.setData>[0]);
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chart && chartRef.current) {
          chart.applyOptions({ width: chartRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    init();

    return () => {
      chart?.remove();
    };
  }, [history, range]);

  const ranges: Range[] = ["1D", "1W", "1M", "1Y"];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1 px-4 pt-3">
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              range === r
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      {history.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
          Chart data unavailable
        </div>
      ) : (
        <div
          ref={chartRef}
          className="w-full"
          style={{ touchAction: "pan-y" }}
        />
      )}
    </div>
  );
}
