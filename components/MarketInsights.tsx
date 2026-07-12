"use client";

import Link from "next/link";
import { LogoImage } from "./LogoImage";
import type { Stock, StockPrice } from "@/lib/types";

export type InsightAssetType = "stocks" | "etfs" | "crypto";
type InsightStock = Stock & { price?: StockPrice; change_30d?: number | null };

function formatMarketCap(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

function formatStreak(days: number | undefined) {
  if (!days) return "No. 1 today";
  return `No. 1 for ${days} day${days === 1 ? "" : "s"}`;
}

function isType(stock: InsightStock, assetType: InsightAssetType) {
  if (assetType === "crypto") return stock.sector === "Cryptocurrency";
  if (assetType === "etfs") return stock.sector === "ETF";
  return stock.sector !== "Cryptocurrency" && stock.sector !== "ETF";
}

function AssetMark({ stock }: { stock: InsightStock }) {
  if (stock.logo_url) {
    return (
      <LogoImage
        src={stock.logo_url}
        ticker={stock.ticker}
        width={24}
        height={24}
        className="rounded-md object-contain bg-white p-0.5 shrink-0"
        fallbackStyle={{ width: 24, height: 24, background: "var(--surface-3)", color: "var(--text-2)" }}
      />
    );
  }
  return (
    <span
      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
    >
      {stock.ticker[0]}
    </span>
  );
}

function PerformanceCard({
  title,
  stocks,
  tone,
}: {
  title: string;
  stocks: InsightStock[];
  tone: "up" | "down" | "neutral";
}) {
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--text-2)";
  return (
    <div className="rounded-xl p-3 min-w-0" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>{title}</p>
      {stocks.length ? (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {stocks.map((stock, index) => (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              className="rounded-lg p-2 min-w-0 transition-opacity hover:opacity-80"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-3)" }}>#{index + 1}</span>
                <span className="text-xs font-bold tabular-nums shrink-0" style={{ color }}>
                  {stock.change_30d != null ? `${stock.change_30d >= 0 ? "+" : ""}${stock.change_30d.toFixed(1)}%` : "—"}
                </span>
              </span>
              <span className="mt-2 flex items-center gap-1.5 min-w-0">
                <AssetMark stock={stock} />
                <span className="min-w-0">
                  <span className="block text-xs font-bold truncate" style={{ color: "var(--text)" }}>{stock.ticker}</span>
                  <span className="block text-[9px] truncate" style={{ color: "var(--text-3)" }}>{stock.name}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>Waiting for 30-day history</p>
      )}
    </div>
  );
}

function MarketCapPodium({
  leaders,
  leaderStreaks,
}: {
  leaders: InsightStock[];
  leaderStreaks: Record<string, number>;
}) {
  const podium = [
    { stock: leaders[1], rank: 2, height: "h-14" },
    { stock: leaders[0], rank: 1, height: "h-20" },
    { stock: leaders[2], rank: 3, height: "h-10" },
  ];

  return (
    <div
      className="rounded-xl p-3 min-w-0 sm:col-span-1 xl:col-span-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
          Market-cap podium
        </p>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>Top 3</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-2 items-end">
        {podium.map(({ stock, rank, height }) => {
          if (!stock) return <div key={rank} />;
          return (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              className="min-w-0 flex flex-col justify-end transition-opacity hover:opacity-80"
            >
              <span
                className="relative z-10 rounded-lg p-2 min-w-0"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border-md)" }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <AssetMark stock={stock} />
                  <span className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>{stock.ticker}</span>
                </span>
                <span className="block mt-1 text-[10px] font-medium tabular-nums truncate" style={{ color: "var(--text-2)" }}>
                  {formatMarketCap(stock.market_cap)}
                </span>
                {rank === 1 && (
                  <span className="block mt-1 text-[9px] truncate" style={{ color: "var(--text-3)" }}>
                    {formatStreak(leaderStreaks[stock.ticker])}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={`-mt-px rounded-t-md flex items-start justify-center pt-2 ${height}`}
                style={{ background: "var(--surface-3)", border: "1px solid var(--border-md)" }}
              >
                <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-3)" }}>#{rank}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function MarketInsights({
  stocks,
  assetType,
  leaderStreaks,
}: {
  stocks: InsightStock[];
  assetType: InsightAssetType;
  leaderStreaks: Record<string, number>;
}) {
  // ETF tab deliberately reuses the stock-market view: ETF market-cap ranks rarely convey a useful change signal.
  const insightAssetType: InsightAssetType = assetType === "etfs" ? "stocks" : assetType;
  const rows = stocks.filter((stock) => isType(stock, insightAssetType));
  const marketCapLeaders = [...rows]
    .filter((stock) => stock.market_cap != null)
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
    .slice(0, 3);
  const leader = marketCapLeaders[0];
  const withPerformance = rows.filter((stock) => stock.change_30d != null);
  const best = [...withPerformance].sort((a, b) => (b.change_30d ?? 0) - (a.change_30d ?? 0)).slice(0, 3);
  const worst = [...withPerformance].sort((a, b) => (a.change_30d ?? 0) - (b.change_30d ?? 0)).slice(0, 3);
  const cryptoIsAllDown = assetType === "crypto" && (best[0]?.change_30d ?? 0) <= 0;

  if (!leader) return null;

  if (assetType !== "crypto") {
    return (
      <section className="grid gap-2 xl:grid-cols-3" aria-label={`${assetType} market insights`}>
        <MarketCapPodium leaders={marketCapLeaders} leaderStreaks={leaderStreaks} />
        <PerformanceCard title="Best 3 · 30D" stocks={best} tone="up" />
        <PerformanceCard title="Worst 3 · 30D" stocks={worst} tone="down" />
      </section>
    );
  }

  return (
    <section className="grid gap-2 sm:grid-cols-3" aria-label={`${assetType} market insights`}>
      <div className="rounded-xl p-3 min-w-0" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
          Market leader
        </p>
        <Link href={`/stock/${leader.ticker}`} className="mt-2 flex items-center gap-2 group">
          <AssetMark stock={leader} />
          <span className="min-w-0">
            <span className="block text-xs font-bold truncate" style={{ color: "var(--text)" }}>{leader.ticker}</span>
            <span className="block text-[10px] truncate" style={{ color: "var(--text-3)" }}>{formatMarketCap(leader.market_cap)}</span>
          </span>
        </Link>
        <p className="mt-2 text-[10px]" style={{ color: "var(--text-3)" }}>
          Market-cap leader
        </p>
      </div>

      <PerformanceCard
        title={cryptoIsAllDown ? "Least down 3 · 30D" : "Best 3 · 30D"}
        stocks={best}
        tone={best[0] && (best[0].change_30d ?? 0) < 0 ? "neutral" : "up"}
      />
      <PerformanceCard title="Worst 3 · 30D" stocks={worst} tone="down" />
    </section>
  );
}
