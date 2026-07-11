import { getMarketStatus } from "@/lib/market-hours";

export function MarketStatusWidget() {
  const { isOpen, nextLabel, timeStr, session, reason, holidayName } = getMarketStatus();
  const closedLabel = reason === "holiday"
    ? `${holidayName ?? "Market holiday"} — US stocks closed`
    : reason === "weekend"
      ? "Weekend — US stocks closed"
      : reason === "after-close"
        ? "US stocks closed for the day"
        : "US stocks open soon";

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
          {isOpen ? session : closedLabel}
        </span>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {timeStr}
      </p>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        {nextLabel}
      </p>
      {!isOpen && (
        <p className="text-[10px]" style={{ color: "var(--accent-2)" }}>
          Crypto markets trade 24/7
        </p>
      )}
    </div>
  );
}
