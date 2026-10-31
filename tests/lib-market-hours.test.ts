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

it("observes the published 2026 Thanksgiving early close",()=>{
 expect(isMarketOpen(new Date("2026-11-27T17:59:00Z"))).toBe(true);
 expect(isMarketOpen(new Date("2026-11-27T18:00:00Z"))).toBe(false);
 expect(getMarketStatus(new Date("2026-11-27T18:01:00Z")).nextLabel).toContain("Mon, Nov 30");
});
