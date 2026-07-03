import { getMarketStatus } from "@/lib/market-hours";

export function MarketStatusWidget() {
  const { isOpen, nextLabel, timeStr, session } = getMarketStatus();

  return (
    <div className="card rounded-xl p-3 space-y-2.5">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-3)" }}
      >
        Market Status
      </p>

      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: isOpen ? "var(--up)" : "var(--text-3)",
            boxShadow: isOpen ? "0 0 6px var(--up)" : "none",
          }}
        />
        <span
          className="text-sm font-bold"
          style={{ color: isOpen ? "var(--up)" : "var(--text-2)" }}
        >
          {session}
        </span>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {timeStr}
      </p>
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {nextLabel}
      </p>
    </div>
  );
}
