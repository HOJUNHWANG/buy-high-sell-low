import { describe, expect, it } from "vitest";
import { getMarketStatus, isMarketOpen } from "@/lib/market-hours";

describe("US market holidays", () => {
  it("closes equities for the full Independence Day observed holiday", () => {
    const holidayNoon = new Date("2026-07-03T16:00:00Z");

    expect(isMarketOpen(holidayNoon)).toBe(false);
    expect(getMarketStatus(holidayNoon).session).toBe("Closed");
    expect(getMarketStatus(holidayNoon).reason).toBe("holiday");
    expect(getMarketStatus(holidayNoon).nextLabel).toBe("Opens Mon, Jul 6 at 9:30 AM ET");
  });

  it("keeps normal weekday regular hours open", () => {
    const weekdayNoon = new Date("2026-07-02T16:00:00Z");

    expect(isMarketOpen(weekdayNoon)).toBe(true);
    expect(getMarketStatus(weekdayNoon).session).toBe("Regular Hours");
  });

  it("explains that weekend prices are from the last session and gives the next opening", () => {
    const saturday = new Date("2026-07-11T16:00:00Z");
    const status = getMarketStatus(saturday);

    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe("weekend");
    expect(status.nextLabel).toBe("Opens Mon, Jul 13 at 9:30 AM ET");
  });
});
