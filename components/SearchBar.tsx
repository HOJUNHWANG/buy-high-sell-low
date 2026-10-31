"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { LogoImage } from "./LogoImage";
import type { Stock } from "@/lib/types";
import type { IndexNotice } from "@/lib/sp100-transition";
import { IndexChangeBadge } from "./IndexChangeBadge";

export function SearchBar() {
  const [query,   setQuery]   = useState("");
  const [debounced, setDebounced] = useState("");
  const [open,    setOpen]    = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // 300ms debounce — avoids API call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching, isError } = useQuery<(Stock & { index_notice?: IndexNotice | null })[]>({
    queryKey: ["search", debounced],
    queryFn: async () => {
      if (!debounced) return [];
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) throw new Error("Search unavailable");
      return res.json();
    },
    enabled: debounced.length > 0,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(ticker: string) {
    setQuery("");
    setOpen(false);
    router.push(`/stock/${ticker}`);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <svg
          className="absolute left-2.5 w-3.5 h-3.5 pointer-events-none"
          style={{ color: "var(--text-3)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          role="combobox"
          aria-label="Search assets"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0 && query === debounced}
          aria-controls={listId}
          aria-activedescendant={open && query === debounced && active >= 0 && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); setActive(-1); }
            if (e.key === "Tab") setOpen(false);
            if (query !== debounced || !results.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault(); setOpen(true);
              setActive((old) => e.key === "ArrowDown" ? (old + 1) % results.length : old <= 0 ? results.length - 1 : old - 1);
            }
            if (e.key === "Enter" && open && results[active >= 0 ? active : 0]) { e.preventDefault(); handleSelect(results[active >= 0 ? active : 0].ticker); }
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--border-md)"; setOpen(true); }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          placeholder="Search assets..."
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md outline-none transition-all"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        {isFetching && (
          <div className="absolute right-2.5 w-3 h-3 rounded-full border border-t-transparent animate-spin"
            style={{ borderColor: "var(--text-3)", borderTopColor: "transparent" }} />
        )}
      </div>

      {open && query === debounced && results.length > 0 && (
        <ul
          id={listId} role="listbox" aria-label="Asset results"
          className="absolute top-full mt-1.5 w-full rounded-lg overflow-hidden z-50"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            maxHeight: "min(360px, 50vh)", overflowY: "auto",
          }}
        >
          {results.map((stock, index) => (
            <li key={stock.ticker} role="presentation">
              <button
                id={`${listId}-${index}`} role="option" aria-selected={active === index} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(stock.ticker)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                style={{ borderBottom: "1px solid var(--border)", background: active === index ? "var(--surface-2)" : undefined }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {stock.logo_url ? (
                  <LogoImage
                    src={stock.logo_url}
                    ticker={stock.ticker}
                    width={18}
                    height={18}
                    className="rounded object-contain bg-white shrink-0"
                    fallbackClassName="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                    fallbackStyle={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                  />
                ) : (
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                  >
                    {stock.ticker[0]}
                  </div>
                )}
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  {stock.ticker}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-xs truncate" style={{ color: "var(--text-2)" }}>{stock.name}</span>
                  <IndexChangeBadge notice={stock.index_notice} />
                </span>
                {stock.exchange && (
                  <span className="ml-auto text-[10px] shrink-0" style={{ color: "var(--text-3)" }}>
                    {stock.exchange}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.length > 0 && !isFetching && results.length === 0 && (
        <div
          className="absolute top-full mt-1.5 w-full rounded-lg px-3 py-3 text-xs z-50"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-md)",
            color: "var(--text-2)",
          }}
        >
          {isError ? "Search unavailable. Please retry." : <>No results for &ldquo;{query}&rdquo;</>}
        </div>
      )}
    </div>
  );
}
