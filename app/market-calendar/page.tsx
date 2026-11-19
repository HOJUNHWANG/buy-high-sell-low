import { MarketStatusWidget } from "@/components/MarketStatusWidget";
import earlyCloses from "@/data/us-market-early-closes.json";
import marketHolidays from "@/data/us-market-holidays.json";
import { getEasternTime } from "@/lib/market-hours";

export const dynamic = "force-dynamic";

function getUpcomingEvents() {
  const today = getEasternTime(new Date()).date;
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return [
    ...marketHolidays.map((holiday) => ({ ...holiday, status: "Closed" })),
    ...earlyCloses.map(({ date, label, closeMinute }) => ({
      date,
      label,
      status: `Early close ${timeFormat.format(closeMinute * 60_000)} ET`,
    })),
  ]
    .filter((event) => event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
}

export const metadata = {
  title: "Market Calendar",
  description: "US market status, upcoming holidays, and price fetch windows.",
};

export default function MarketCalendarPage() {
  const upcomingEvents = getUpcomingEvents();
  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div className="page-header">
        <p className="page-kicker mb-2">Planning</p>
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
          <p className="mt-2"><strong style={{ color: "var(--text)" }}>Settlement refresh:</strong> first successful price update 45–75 minutes after the session closes.</p>
        </div>
      </div>

      <section className="card rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Upcoming US Market Schedule</h2>
        <div className="space-y-2">
          {upcomingEvents.map((item) => (
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
