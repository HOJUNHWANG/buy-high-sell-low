// Server Component — pure time calculation, no DB needed
function getMarketStatus() {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  const mins = et.getHours() * 60 + et.getMinutes();

  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && mins >= 570 && mins < 960; // 9:30–16:00

  let nextLabel = "";
  if (isOpen) {
    const left = 960 - mins;
    nextLabel = `Closes in ${Math.floor(left / 60)}h ${left % 60}m`;
  } else if (isWeekday && mins < 570) {
    const left = 570 - mins;
    nextLabel = `Opens in ${Math.floor(left / 60)}h ${left % 60}m`;
  } else if (day === 5 && mins >= 960) {
    nextLabel = "Opens Monday 9:30 AM ET";
  } else if (day === 6) {
    nextLabel = "Opens Monday 9:30 AM ET";
  } else if (day === 0) {
    nextLabel = "Opens Monday 9:30 AM ET";
  } else {
    nextLabel = "Opens tomorrow 9:30 AM ET";
  }

  const timeStr = et.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const session =
    isOpen
      ? "Regular Hours"
      : isWeekday && mins >= 480 && mins < 570
      ? "Pre-Market"
      : isWeekday && mins >= 960 && mins < 1200
      ? "After Hours"
      : "Closed";

  return { isOpen, nextLabel, timeStr, session };
}

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
