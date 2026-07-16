"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FictionalExchange, FictionalRisk, FictionalSector, FictionalSnapshot } from "@/data/fictional-market";
import { fictionalExchangeOrder, formatFictionalMarketCap, getFictionalCompanyProfile } from "@/data/fictional-market";
import { FictionalTickerMark } from "@/components/FictionalTickerMark";

type SortKey = "marketCap" | "price" | "changePct" | "volume" | "technology" | "influence";
type SortDir = "asc" | "desc";

function formatVolume(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: active ? 1 : 0.35 }}>
      {active && dir === "asc" ? <path d="M4 1L7 6H1L4 1Z" /> : <path d="M4 7L1 2H7L4 7Z" />}
    </svg>
  );
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const width = 104;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="28 point price sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "var(--up)" : "var(--down)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function riskClass(risk: FictionalRisk) {
  if (risk === "Existential" || risk === "Extreme") return "badge-down";
  if (risk === "High") return "badge-warn";
  if (risk === "Moderate") return "badge-muted";
  return "badge-up";
}

export function FictionalMarketTable({ rows }: { rows: FictionalSnapshot[] }) {
  const [query, setQuery] = useState("");
  const [exchange, setExchange] = useState<FictionalExchange | "All">("All");
  const [sector, setSector] = useState<FictionalSector | "All">("All");
  const [risk, setRisk] = useState<FictionalRisk | "All">("All");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "marketCap", dir: "desc" });
  const [view, setView] = useState<"table" | "grid">("table");

  const sectors = useMemo<(FictionalSector | "All")[]>(() => ["All", ...Array.from(new Set(rows.map((row) => row.sector))).sort()], [rows]);
  const risks = useMemo<(FictionalRisk | "All")[]>(() => ["All", "Moderate", "High", "Extreme", "Existential"], []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => exchange === "All" || row.exchange === exchange)
      .filter((row) => sector === "All" || row.sector === sector)
      .filter((row) => risk === "All" || row.risk === risk)
      .filter((row) => {
        if (!q) return true;
        return (
          row.ticker.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q) ||
          row.source.toLowerCase().includes(q) ||
          row.sector.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1;
        return (a[sort.key] - b[sort.key]) * dir;
      });
  }, [exchange, query, risk, rows, sector, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  const headerButton = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap ${align === "right" ? "justify-end" : ""}`}
      style={{ color: sort.key === key ? "var(--text)" : "var(--text-3)" }}
    >
      <span>{label}</span>
      <SortIcon active={sort.key === key} dir={sort.dir} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative w-full lg:w-72">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-3)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, ticker, universe"
            className="pl-8 pr-3 py-2 rounded-lg text-xs w-full"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-md)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <select
          aria-label="Exchange"
          value={exchange}
          onChange={(event) => setExchange(event.target.value as FictionalExchange | "All")}
          className="px-3 py-2 rounded-lg text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border-md)", color: "var(--text)" }}
        >
          <option value="All">All venues</option>
          {fictionalExchangeOrder.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <select
          aria-label="Sector"
          value={sector}
          onChange={(event) => setSector(event.target.value as FictionalSector | "All")}
          className="px-3 py-2 rounded-lg text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border-md)", color: "var(--text)" }}
        >
          {sectors.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <select
          aria-label="Risk"
          value={risk}
          onChange={(event) => setRisk(event.target.value as FictionalRisk | "All")}
          className="px-3 py-2 rounded-lg text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border-md)", color: "var(--text)" }}
        >
          {risks.map((item) => (
            <option key={item} value={item}>{item === "All" ? "All risk" : item}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            {filteredRows.length} listed
          </span>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
            {(["table", "grid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className="px-2.5 py-1.5 text-xs"
                style={{
                  background: view === mode ? "var(--surface-3)" : "transparent",
                  color: view === mode ? "var(--text)" : "var(--text-3)",
                }}
                aria-label={`${mode} view`}
              >
                {mode === "table" ? (
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredRows.map((row) => {
            const positive = row.changePct >= 0;
            return (
              <Link key={row.ticker} href={`/fictional-market/${row.ticker}`} className="card-clickable p-4 block">
                <div className="flex items-start gap-3">
                  <FictionalTickerMark ticker={row.ticker} color={row.color} accent={row.accent} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                          {row.name}
                        </h3>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                          {row.ticker} · {row.exchange} · {row.source}
                        </p>
                      </div>
                      <span className={`badge ${riskClass(row.risk)}`}>{row.risk}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div>
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Price</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>${row.price.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Change</p>
                        <p className="text-sm font-semibold" style={{ color: positive ? "var(--up)" : "var(--down)" }}>
                          {positive ? "+" : ""}{row.changePct.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Cap</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formatFictionalMarketCap(row.marketCap)}</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3 mt-4">
                      <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--text-2)" }}>
                        {getFictionalCompanyProfile(row.ticker, row.note)}
                      </p>
                      <Sparkline values={row.sparkline} positive={positive} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <tr>
                  <th className="px-5 py-4 text-left font-semibold" style={{ color: "var(--text-3)" }}>Company</th>
                  <th className="px-5 py-4 text-left font-semibold" style={{ color: "var(--text-3)" }}>World role</th>
                  <th className="px-5 py-4 text-left font-semibold" style={{ color: "var(--text-3)" }}>Sector</th>
                  <th className="px-5 py-4 text-right">{headerButton("price", "Price")}</th>
                  <th className="px-5 py-4 text-right">{headerButton("changePct", "Today")}</th>
                  <th className="px-5 py-4 text-right min-w-[104px]">{headerButton("marketCap", "Market cap")}</th>
                  <th className="px-5 py-4 text-right">{headerButton("volume", "Volume")}</th>
                  <th className="px-5 py-4 text-left font-semibold" style={{ color: "var(--text-3)" }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const positive = row.changePct >= 0;
                  return (
                    <tr key={row.ticker} className="transition-colors hover:bg-white/[0.025]" style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-5 py-5 min-w-[280px]">
                        <Link href={`/fictional-market/${row.ticker}`} className="flex items-center gap-3">
                          <FictionalTickerMark ticker={row.ticker} color={row.color} accent={row.accent} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold" style={{ color: "var(--text)" }}>{row.ticker}</span>
                              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{row.exchange}</span>
                            </div>
                            <p className="truncate mt-0.5" style={{ color: "var(--text-2)" }}>{row.name}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>{row.source}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-5 min-w-[300px] max-w-[390px]">
                        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-2)" }}>
                          {getFictionalCompanyProfile(row.ticker, row.note)}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="badge badge-muted">Influence {row.influence}</span>
                          <span className="badge badge-muted">Tech {row.technology}</span>
                        </div>
                      </td>
                      <td className="px-5 py-5 min-w-[150px]" style={{ color: "var(--text-2)" }}>{row.sector}</td>
                      <td className="px-5 py-5 text-right font-semibold whitespace-nowrap" style={{ color: "var(--text)" }}>${row.price.toFixed(2)}</td>
                      <td className="px-5 py-5 text-right font-semibold whitespace-nowrap" style={{ color: positive ? "var(--up)" : "var(--down)" }}>
                        {positive ? "+" : ""}{row.changePct.toFixed(2)}%
                      </td>
                      <td className="px-5 py-5 text-right whitespace-nowrap min-w-[104px]" style={{ color: "var(--text-2)" }}>{formatFictionalMarketCap(row.marketCap)}</td>
                      <td className="px-5 py-5 text-right whitespace-nowrap" style={{ color: "var(--text-2)" }}>{formatVolume(row.volume)}</td>
                      <td className="px-5 py-5"><span className={`badge ${riskClass(row.risk)}`}>{row.risk}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
