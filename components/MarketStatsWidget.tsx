import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function MarketStatsWidget() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("stock_prices")
    .select("change_pct");

  let up = 0, down = 0, flat = 0;
  for (const row of data ?? []) {
    const pct = row.change_pct as number | null;
    if (pct == null) { flat++; continue; }
    if (pct > 0.05) up++;
    else if (pct < -0.05) down++;
    else flat++;
  }

  const total = up + down + flat;
  const upPct  = total > 0 ? Math.round((up   / total) * 100) : 0;
  const downPct = total > 0 ? Math.round((down / total) * 100) : 0;

  return (
    <div className="card rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-3)" }}
        >
          Market Breadth
        </p>
        <Link
          href="/stocks"
          className="text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          All →
        </Link>
      </div>

      <div className="space-y-2">
        {[
          { label: "Advancing", count: up,   color: "var(--up)",    bg: "var(--up-dim)"   },
          { label: "Declining", count: down, color: "var(--down)",  bg: "var(--down-dim)" },
          { label: "Flat",      count: flat, color: "var(--text-3)", bg: "var(--surface-3)" },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: bg, border: `1px solid ${color}` }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {label}
              </span>
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Breadth bar */}
      {total > 0 && (
        <div>
          <div
            className="h-2 rounded-full overflow-hidden flex"
            style={{ background: "var(--surface-3)" }}
          >
            <div style={{ width: `${upPct}%`,   background: "var(--up)",   opacity: 0.75 }} />
            <div style={{ width: `${downPct}%`, background: "var(--down)", opacity: 0.75 }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px]" style={{ color: "var(--up)" }}>{upPct}% up</span>
            <span className="text-[9px]" style={{ color: "var(--down)" }}>{downPct}% down</span>
          </div>
        </div>
      )}
    </div>
  );
}
