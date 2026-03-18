"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Stock } from "@/lib/types";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<Stock[]>({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!query || query.length < 1) return [];
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length > 0,
  });

  // Close dropdown on outside click
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
    <div ref={containerRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query && setOpen(true)}
        placeholder="Search stocks..."
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      {open && results.length > 0 && (
        <ul className="absolute top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-md shadow-lg z-50 overflow-hidden">
          {results.map((stock) => (
            <li key={stock.ticker}>
              <button
                onClick={() => handleSelect(stock.ticker)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-800 transition-colors text-left"
              >
                {stock.logo_url && (
                  <Image
                    src={stock.logo_url}
                    alt={stock.name}
                    width={20}
                    height={20}
                    className="rounded-sm object-contain bg-white"
                  />
                )}
                <span className="font-medium text-white">{stock.ticker}</span>
                <span className="text-gray-400 truncate">{stock.name}</span>
                {stock.exchange && (
                  <span className="ml-auto text-xs text-gray-500">{stock.exchange}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.length > 0 && results.length === 0 && (
        <div className="absolute top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-md shadow-lg z-50 px-3 py-2 text-sm text-gray-500">
          No results for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
