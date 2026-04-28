import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Stock, StockPrice } from "@/lib/types";
import { LogoImage } from "./LogoImage";
import Link from "next/link";


export async function WatchlistSection({ userId }: { userId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: wl } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (!wl || wl.length === 0) {
    return (
      <section className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-3)" }}>
          My Watchlist
        </p>
        <div
          className="rounded-xl px-5 py-6 flex flex-col items-center gap-2"
          style={{ border: "1px dashed var(--border-md)" }}
        >
          <span className="text-2xl">⭐</span>
          <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            Your watchlist is empty
          </p>
          <p className="text-xs text-center max-w-xs" style={{ color: "var(--text-3)" }}>
            Open any stock and tap the star icon to add it here.
            Your tracked picks will show up in this section.
          </p>
        </div>
      </section>
    );
  }

  const tickers = wl.map((w) => w.ticker);

  const { data: prices } = await supabase
    .from("stock_prices")
    .select("*, stocks(*)")
    .in("ticker", tickers);

  const priceMap = new Map<string, StockPrice & { stocks: Stock }>(
    (prices ?? []).map((p) => [p.ticker, p as StockPrice & { stocks: Stock }])
  );
  const ordered = tickers
    .map((t) => priceMap.get(t))
    .filter((p): p is StockPrice & { stocks: Stock } => !!p);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          My Watchlist
        </p>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
          {tickers.length} stock{tickers.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {ordered.map((item) => {
          const pct  = item.change_pct ?? 0;
          const isUp = pct >= 0;
          const sign = isUp ? "+" : "";
          return (
            <Link
              key={item.ticker}
              href={`/stock/${item.ticker}`}
              className="card-clickable rounded-xl p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                {item.stocks?.logo_url ? (
                  <LogoImage
                    src={item.stocks.logo_url}
                    ticker={item.ticker}
                    width={18}
                    height={18}
                    className="rounded object-contain bg-white p-0.5 shrink-0"
                    fallbackTextSize="text-[8px]"
                    fallbackStyle={{ width: 18, height: 18, background: "var(--surface-3)", color: "var(--text-2)" }}
                  />
                ) : (
                  <div
                    className="w-[18px] h-[18px] rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                    style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                  >
                    {item.ticker[0]}
                  </div>
                )}
                <span className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                  {item.ticker}
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  ${item.price.toFixed(2)}
                </div>
                <div
                  className="text-[10px] font-medium mt-0.5"
                  style={{ color: isUp ? "var(--up)" : "var(--down)" }}
                >
                  {sign}{pct.toFixed(2)}%
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
