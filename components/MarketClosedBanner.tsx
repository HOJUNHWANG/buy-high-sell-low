import Link from "next/link";
import { getMarketStatus } from "@/lib/market-hours";

export function MarketClosedBanner() {
  const status = getMarketStatus();
  if (status.isOpen) return null;

  const reason = status.reason === "holiday"
    ? `${status.holidayName ?? "Market holiday"}`
    : status.reason === "weekend"
      ? "Weekend"
      : status.reason === "after-close"
        ? "Market day complete"
        : "Before the opening bell";

  return (
    <section
      className="mb-7 rounded-2xl p-5 sm:p-6 market-closed-banner"
      aria-label="US market closed notice"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--text-3)" }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-2)" }}>
              {reason}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text)" }}>
            US stocks are closed
          </h2>
          <p className="text-xs mt-1.5 leading-relaxed max-w-xl" style={{ color: "var(--text-2)" }}>
            Stock and ETF prices show the last completed market session. {status.nextLabel}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/stocks?tab=crypto" className="btn btn-primary btn-sm">
            Explore live crypto
          </Link>
          <Link href="/market-calendar" className="btn btn-secondary btn-sm">
            Market calendar
          </Link>
        </div>
      </div>
    </section>
  );
}
