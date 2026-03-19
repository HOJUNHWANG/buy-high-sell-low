import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function SectorWidget() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("stock_prices")
    .select("change_pct, stocks(sector)");

  // Group by sector → avg change_pct
  const map = new Map<string, number[]>();
  for (const row of data ?? []) {
    const sector = (row.stocks as unknown as { sector: string | null } | null)?.sector;
    if (!sector || row.change_pct == null) continue;
    if (!map.has(sector)) map.set(sector, []);
    map.get(sector)!.push(row.change_pct as number);
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
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-3)" }}
        >
          Sectors
        </p>
        <Link
          href="/stocks"
          className="text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          All →
        </Link>
      </div>

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
