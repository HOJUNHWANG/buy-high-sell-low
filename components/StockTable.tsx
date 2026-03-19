"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Stock, StockPrice } from "@/lib/types";
import { fmtVol } from "@/lib/utils";

type StockRow = Stock & { price?: StockPrice };
type SortKey = "ticker" | "name" | "price" | "change_pct" | "volume";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="currentColor"
      style={{ opacity: active ? 1 : 0.3, flexShrink: 0 }}
    >
      {active && dir === "asc" ? (
        <path d="M4 1L7 6H1L4 1Z" />
      ) : (
        <path d="M4 7L1 2H7L4 7Z" />
      )}
    </svg>
  );
}


export function StockTable({ stocks }: { stocks: StockRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "change_pct",
    dir: "desc",
  });
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");

  const sectors = useMemo(() => {
    const s = new Set<string>();
    stocks.forEach((st) => { if (st.sector) s.add(st.sector); });
    return ["All", ...Array.from(s).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    return stocks
      .filter((s) => sector === "All" || s.sector === sector)
      .filter((s) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1;
        switch (sort.key) {
          case "ticker":     return a.ticker.localeCompare(b.ticker) * dir;
          case "name":       return a.name.localeCompare(b.name) * dir;
          case "price":      return ((a.price?.price ?? 0) - (b.price?.price ?? 0)) * dir;
          case "change_pct": return ((a.price?.change_pct ?? -999) - (b.price?.change_pct ?? -999)) * dir;
          case "volume":     return ((a.price?.volume ?? 0) - (b.price?.volume ?? 0)) * dir;
          default:           return 0;
        }
      });
  }, [stocks, sector, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  const th = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-4 py-2.5 font-medium select-none cursor-pointer text-${align}`}
      style={{ color: sort.key === key ? "var(--text)" : "var(--text-3)" }}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {align === "right" && <SortIcon active={sort.key === key} dir={sort.dir} />}
        <span>{label}</span>
        {align === "left" && <SortIcon active={sort.key === key} dir={sort.dir} />}
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-3)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search ticker or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-lg text-xs w-full sm:w-60"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-md)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            {filtered.length} stocks
          </span>

          {/* View toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border-md)" }}
          >
            {(["table", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-2.5 py-1.5 text-xs"
                style={{
                  background: view === v ? "var(--surface-3)" : "transparent",
                  color: view === v ? "var(--text)" : "var(--text-3)",
                }}
              >
                {v === "table" ? (
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

      {/* Sector tabs */}
      <div className="flex gap-1 flex-wrap pb-1 overflow-x-auto">
        {sectors.map((s) => (
          <button
            key={s}
            onClick={() => setSector(s)}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors"
            style={{
              background: sector === s ? "var(--surface-3)" : "transparent",
              color:      sector === s ? "var(--text)"      : "var(--text-3)",
              border:     sector === s ? "1px solid var(--border-md)" : "1px solid transparent",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table view */}
      {view === "table" && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <th
                    className="text-left px-4 py-2.5 font-medium w-8 tabular-nums"
                    style={{ color: "var(--text-3)" }}
                  >
                    #
                  </th>
                  {th("ticker",     "Ticker")}
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell"
                    style={{ color: sort.key === "name" ? "var(--text)" : "var(--text-3)", cursor: "pointer", userSelect: "none" }}
                    onClick={() => toggleSort("name")}>
                    <div className="flex items-center gap-1">
                      Name <SortIcon active={sort.key === "name"} dir={sort.dir} />
                    </div>
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell"
                    style={{ color: "var(--text-3)" }}>
                    Sector
                  </th>
                  {th("price",      "Price",   "right")}
                  {th("change_pct", "Change%", "right")}
                  {th("volume",     "Volume",  "right")}
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock, idx) => {
                  const pct  = stock.price?.change_pct ?? null;
                  const isUp = (pct ?? 0) >= 0;
                  return (
                    <tr
                      key={stock.ticker}
                      className="tr-hover group"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-3)" }}>
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/stock/${stock.ticker}`}
                          className="flex items-center gap-2 group-hover:opacity-80 transition-opacity"
                        >
                          {stock.logo_url ? (
                            <Image
                              src={stock.logo_url}
                              alt={stock.ticker}
                              width={20}
                              height={20}
                              className="rounded object-contain bg-white p-0.5 shrink-0"
                            />
                          ) : (
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                              style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                            >
                              {stock.ticker[0]}
                            </div>
                          )}
                          <span className="font-semibold" style={{ color: "var(--text)" }}>
                            {stock.ticker}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell max-w-[180px]">
                        <Link
                          href={`/stock/${stock.ticker}`}
                          className="block truncate"
                          style={{ color: "var(--text-2)" }}
                        >
                          {stock.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--text-3)" }}>
                        {stock.sector ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                        {stock.price ? `$${stock.price.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pct !== null ? (
                          <span
                            className="font-semibold px-2 py-0.5 rounded tabular-nums"
                            style={{
                              color:      isUp ? "var(--up)"       : "var(--down)",
                              background: isUp ? "var(--up-dim)"   : "var(--down-dim)",
                            }}
                          >
                            {isUp ? "+" : ""}{pct.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums"
                        style={{ color: "var(--text-3)" }}
                      >
                        {fmtVol(stock.price?.volume)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: "var(--text-3)" }}
                    >
                      No stocks match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((stock) => {
            const pct  = stock.price?.change_pct ?? null;
            const isUp = (pct ?? 0) >= 0;
            return (
              <Link
                key={stock.ticker}
                href={`/stock/${stock.ticker}`}
                className="card-clickable rounded-xl p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  {stock.logo_url ? (
                    <Image
                      src={stock.logo_url}
                      alt={stock.ticker}
                      width={18}
                      height={18}
                      className="rounded object-contain bg-white p-0.5 shrink-0"
                    />
                  ) : (
                    <div
                      className="w-[18px] h-[18px] rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                      style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                    >
                      {stock.ticker[0]}
                    </div>
                  )}
                  <span
                    className="text-xs font-bold truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {stock.ticker}
                  </span>
                </div>
                <p
                  className="text-[10px] truncate"
                  style={{ color: "var(--text-3)" }}
                >
                  {stock.name}
                </p>
                <div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: "var(--text)" }}>
                    {stock.price ? `$${stock.price.price.toFixed(2)}` : "—"}
                  </div>
                  {pct !== null && (
                    <div
                      className="text-[11px] font-semibold mt-0.5 tabular-nums"
                      style={{ color: isUp ? "var(--up)" : "var(--down)" }}
                    >
                      {isUp ? "+" : ""}{pct.toFixed(2)}%
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div
              className="col-span-full py-10 text-center text-sm"
              style={{ color: "var(--text-3)" }}
            >
              No stocks match your filters
            </div>
          )}
        </div>
      )}
    </div>
  );
}
