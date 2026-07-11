import Link from "next/link";
import { getAllStockPrices } from "@/lib/cached-data";
import { getMarketStatus } from "@/lib/market-hours";

export async function SectorWidget() {
  const data = await getAllStockPrices();
  const marketStatus = getMarketStatus();

  // Sector performance should reflect US equities only. Crypto and ETFs have
  // distinct trading calendars and would make a closed-market ranking misleading.
  const map = new Map<string, number[]>();
  for (const row of data) {
    const sector = row.stocks?.sector;
    if (!sector || sector === "Cryptocurrency" || sector === "ETF" || row.change_pct == null) continue;
    if (!map.has(sector)) map.set(sector, []);
    map.get(sector)!.push(row.change_pct);
  }

  const sectors = Array.from(map.entries())
    .map(([name, vals]) => ({
      name,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      count: vals.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  if (sectors.length === 0) return null;

  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.avg)));

  return (
    <div className="card rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-3)" }}
          >
            US Sectors
          </p>
          {!marketStatus.isOpen && (
            <p className="text-[9px] mt-1" style={{ color: "var(--text-3)" }}>
              Final moves from last close
            </p>
          )}
        </div>
        <Link
          href="/stocks"
          className="text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          All →
        </Link>
      </div>

      {!marketStatus.isOpen && (
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-3)" }} />
          <span className="text-[9px] font-medium" style={{ color: "var(--text-2)" }}>US market closed</span>
          <Link href="/stocks?tab=crypto" className="ml-auto text-[9px] font-medium" style={{ color: "var(--accent)" }}>
            Crypto live →
          </Link>
        </div>
      )}

      <div className="space-y-2.5">
        {sectors.map(({ name, avg, count }) => {
          const isUp = avg >= 0;
          const barW = maxAbs > 0 ? (Math.abs(avg) / maxAbs) * 100 : 0;
          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[10px] truncate max-w-[100px]"
                  style={{ color: "var(--text-2)" }}
                  title={`${name} (${count} stocks)`}
                >
                  {name}
                </span>
                <span
                  className="text-[10px] font-semibold ml-1 shrink-0"
                  style={{ color: isUp ? "var(--up)" : "var(--down)" }}
                >
                  {isUp ? "+" : ""}
                  {avg.toFixed(2)}%
                </span>
              </div>
              <div
                className="h-1 rounded-full"
                style={{ background: "var(--surface-3)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${barW}%`,
                    background: isUp ? "var(--up)" : "var(--down)",
                    opacity: 0.65,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
