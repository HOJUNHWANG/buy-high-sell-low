import { describe, expect, it } from "vitest";
import { getMarketStatus, isMarketOpen } from "@/lib/market-hours";

describe("US market holidays", () => {
  it("closes equities for the full Independence Day observed holiday", () => {
    const holidayNoon = new Date("2026-07-03T16:00:00Z");

    expect(isMarketOpen(holidayNoon)).toBe(false);
    expect(getMarketStatus(holidayNoon).session).toBe("Closed");
  });

  it("keeps normal weekday regular hours open", () => {
    const weekdayNoon = new Date("2026-07-02T16:00:00Z");

    expect(isMarketOpen(weekdayNoon)).toBe(true);
    expect(getMarketStatus(weekdayNoon).session).toBe("Regular Hours");
  });
});
