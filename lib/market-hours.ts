import marketHolidays from "@/data/us-market-holidays.json";

/** US equity market hours. Crypto (tickers ending in -USD) remains available 24/7. */

const HOLIDAYS = new Map(marketHolidays.map((holiday) => [holiday.date, holiday.label]));

type EasternTime = {
  date: string;
  weekday: string;
  mins: number;
  timeStr: string;
};

export type MarketStatus = {
  isOpen: boolean;
  nextLabel: string;
  timeStr: string;
  session: "Regular Hours" | "Pre-Market" | "After Hours" | "Closed";
};

function getEasternTime(now: Date): EasternTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    mins: Number(parts.hour) * 60 + Number(parts.minute),
    timeStr: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(now),
  };
}

export function getMarketHoliday(date: string): string | undefined {
  return HOLIDAYS.get(date);
}

export function isCrypto(ticker: string): boolean {
  return ticker.endsWith("-USD");
}

export function isMarketOpen(now = new Date()): boolean {
  const et = getEasternTime(now);
  const isWeekday = et.weekday !== "Sat" && et.weekday !== "Sun";
  return isWeekday && !HOLIDAYS.has(et.date) && et.mins >= 570 && et.mins < 960;
}

export function getMarketStatusMessage(now = new Date()): string {
  const et = getEasternTime(now);
  if (HOLIDAYS.has(et.date)) return "Market is closed (holiday). Opens next trading day 9:30 AM ET.";
  if (et.weekday === "Sat" || et.weekday === "Sun") {
    return "Market is closed (weekend). Opens next trading day 9:30 AM ET.";
  }
  if (et.mins < 570) {
    const left = 570 - et.mins;
    return `Market is closed. Opens in ${Math.floor(left / 60)}h ${left % 60}m.`;
  }
  if (et.mins >= 960) return "Market is closed. Opens next trading day 9:30 AM ET.";
  return "Market is open.";
}

export function getMarketStatus(now = new Date()): MarketStatus {
  const et = getEasternTime(now);
  const isWeekday = et.weekday !== "Sat" && et.weekday !== "Sun";
  const isHoliday = HOLIDAYS.has(et.date);
  const isOpen = isWeekday && !isHoliday && et.mins >= 570 && et.mins < 960;

  let nextLabel: string;
  if (isOpen) {
    const left = 960 - et.mins;
    nextLabel = `Closes in ${Math.floor(left / 60)}h ${left % 60}m`;
  } else if (isWeekday && !isHoliday && et.mins < 570) {
    const left = 570 - et.mins;
    nextLabel = `Opens in ${Math.floor(left / 60)}h ${left % 60}m`;
  } else {
    nextLabel = "Opens next trading day 9:30 AM ET";
  }

  const session = isOpen
    ? "Regular Hours"
    : isWeekday && !isHoliday && et.mins >= 480 && et.mins < 570
      ? "Pre-Market"
      : isWeekday && !isHoliday && et.mins >= 960 && et.mins < 1200
        ? "After Hours"
        : "Closed";

  return { isOpen, nextLabel, timeStr: et.timeStr, session };
}
