import { MarketStatusWidget } from "@/components/MarketStatusWidget";
import marketHolidays from "@/data/us-market-holidays.json";

const UPCOMING_2026 = [
  ...marketHolidays
    .filter((holiday) => holiday.date.startsWith("2026-"))
    .map((holiday) => ({ ...holiday, status: "Closed" })),
  { date: "2026-11-27", label: "Day after Thanksgiving", status: "Early close 1:00 PM ET" },
  { date: "2026-12-24", label: "Christmas Eve", status: "Early close 1:00 PM ET" },
].sort((a, b) => a.date.localeCompare(b.date));

export const metadata = {
  title: "Market Calendar",
  description: "US market status, upcoming holidays, and price fetch windows.",
};

export default function MarketCalendarPage() {
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Market Calendar</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          Regular hours, after-close settlement window, and upcoming US market holidays.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <MarketStatusWidget />
        <div className="card rounded-xl p-4 text-sm" style={{ color: "var(--text-2)" }}>
          <p><strong style={{ color: "var(--text)" }}>Regular session:</strong> 9:30 AM – 4:00 PM ET</p>
          <p className="mt-2"><strong style={{ color: "var(--text)" }}>Price cron:</strong> every 10 minutes; stocks are skipped outside market/post-close windows.</p>
          <p className="mt-2"><strong style={{ color: "var(--text)" }}>Settlement refresh:</strong> first successful 10-minute cron tick between 4:45 PM – 5:15 PM ET, once per day.</p>
        </div>
      </div>

      <section className="card rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Upcoming 2026 US Market Holidays</h2>
        <div className="space-y-2">
          {UPCOMING_2026.map((item) => (
            <div key={item.date} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{item.label}</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{item.date}</p>
              </div>
              <span className="text-xs font-medium" style={{ color: item.status.includes("Early") ? "var(--accent)" : "var(--down)" }}>{item.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
