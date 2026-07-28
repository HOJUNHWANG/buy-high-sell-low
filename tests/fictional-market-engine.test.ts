import { describe, expect, it } from "vitest";
import { fictionalCompanies, fictionalExchangeOrder } from "@/data/fictional-market";
import { priceFictionalCompany } from "@/lib/fictional-market-engine";
import {
  getActiveMajorEvents,
  getMajorEventCycleStatus,
  majorEventCatalogStats,
} from "@/lib/fictional-major-events";

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

describe("fictional market engine", () => {
  it("keeps after-hours prices moving on 30-minute cron slots", () => {
    const company = fictionalCompanies.find((item) => item.ticker === "CHOAM") ?? fictionalCompanies[0];
    const existingDaily = {
      open: company.basePrice,
      high: company.basePrice,
      low: company.basePrice,
      close: company.basePrice,
      volume: 0,
    };
    const times = [
      "2026-07-09T22:00:00Z",
      "2026-07-09T22:30:00Z",
      "2026-07-09T23:00:00Z",
      "2026-07-09T23:30:00Z",
    ];

    const prices = times.map((time) => priceFictionalCompany({
      company,
      now: new Date(time),
      existingPrice: { price: company.basePrice, change_pct: 0 },
      existingDaily,
    }).price.price);

    expect(new Set(prices).size).toBeGreaterThan(1);
  });

  it("spreads listings and market cap across the three competing exchanges", () => {
    const venueStats = fictionalExchangeOrder.map((exchange) => ({
      listings: fictionalCompanies.filter((company) => company.exchange === exchange).length,
      marketCap: fictionalCompanies
        .filter((company) => company.exchange === exchange)
        .reduce((sum, company) => sum + company.marketCap, 0),
    }));
    const marketCaps = venueStats.map((venue) => venue.marketCap);

    expect(venueStats.every((venue) => venue.listings > 0)).toBe(true);
    expect(venueStats.reduce((sum, venue) => sum + venue.listings, 0)).toBe(fictionalCompanies.length);
    expect(Math.max(...marketCaps) / Math.min(...marketCaps)).toBeLessThan(1.06);
  });

  it("ships at least 100 world and company-scale event scenarios", () => {
    expect(majorEventCatalogStats.total).toBeGreaterThanOrEqual(100);
    expect(majorEventCatalogStats.world).toBeGreaterThanOrEqual(30);
    expect(majorEventCatalogStats.company).toBeGreaterThanOrEqual(20);
    expect(majorEventCatalogStats.categories).toBeGreaterThanOrEqual(20);
    expect(majorEventCatalogStats.dailyProbabilityIncrementPct).toBe(1);
    expect(majorEventCatalogStats.minDurationDays).toBe(3);
    expect(majorEventCatalogStats.maxDurationDays).toBe(30);
    expect(majorEventCatalogStats.cumulativeImpactCapPct).toBe(40);
  });

  it("adds 1% per eligible midnight, resets on trigger, and pauses during events", () => {
    const starts: NonNullable<ReturnType<typeof getMajorEventCycleStatus>["activeEvent"]>[] = [];
    const firstDay = "2020-01-01";

    for (let offset = 0; offset < 3650; offset += 1) {
      const day = shiftDay(firstDay, offset);
      const status = getMajorEventCycleStatus(day, fictionalCompanies);
      if (status.activeEvent?.startDate === day) starts.push(status.activeEvent);
      if (status.isActive) {
        expect(status.probabilityPct).toBe(0);
        expect(status.accumulationPaused).toBe(true);
      }
    }

    expect(starts.length).toBeGreaterThan(70);
    expect(starts.length).toBeLessThan(180);
    expect(new Set(starts.map((event) => event.durationDays)).size).toBeGreaterThan(1);
    expect(starts.every((event) => event.durationDays >= 3 && event.durationDays <= 30)).toBe(true);

    const firstEvent = starts[0];
    for (let offset = 0; offset < firstEvent.durationDays; offset += 1) {
      const status = getMajorEventCycleStatus(shiftDay(firstEvent.startDate, offset), fictionalCompanies);
      expect(status.activeEvent?.eventKey).toBe(firstEvent.eventKey);
      expect(status.probabilityPct).toBe(0);
    }

    const dayAfter = getMajorEventCycleStatus(
      shiftDay(firstEvent.startDate, firstEvent.durationDays),
      fictionalCompanies,
    );
    expect(dayAfter.evaluatedProbabilityPct).toBe(1);
    expect(dayAfter.probabilityPct).toBeLessThanOrEqual(1);
  });

  it("varies the daily shock while keeping compounded event impact inside ±40%", () => {
    const company = fictionalCompanies.find((item) => item.ticker === "CHOAM") ?? fictionalCompanies[0];
    let startDate: string | null = null;

    for (let offset = 0; !startDate && offset < 5000; offset += 1) {
      const day = shiftDay("2020-01-01", offset);
      const status = getMajorEventCycleStatus(day, fictionalCompanies);
      if (status.activeEvent?.startDate === day && status.activeEvent.targetTicker == null) startDate = day;
    }

    expect(startDate).not.toBeNull();
    if (!startDate) return;
    const started = getActiveMajorEvents(company, startDate, fictionalCompanies)[0];
    expect(started).toBeDefined();
    if (!started) return;

    const impacts: number[] = [];
    let compoundedFactor = 1;
    for (let offset = 0; offset < started.durationDays; offset += 1) {
      const active = getActiveMajorEvents(company, shiftDay(started.startDate, offset), fictionalCompanies)
        .find((event) => event.eventKey === started?.eventKey);
      expect(active?.dayNumber).toBe(offset + 1);
      expect(Math.abs(active?.cumulativeImpactPct ?? 0)).toBeLessThanOrEqual(40);
      impacts.push(active?.currentImpactPct ?? 0);
      compoundedFactor *= 1 + (active?.currentImpactPct ?? 0) / 100;
    }

    const afterExpiry = getActiveMajorEvents(
      company,
      shiftDay(started.startDate, started.durationDays),
      fictionalCompanies,
    )
      .find((event) => event.eventKey === started?.eventKey);
    expect(afterExpiry).toBeUndefined();
    expect(new Set(impacts).size).toBeGreaterThan(1);
    expect(Math.abs((compoundedFactor - 1) * 100)).toBeLessThanOrEqual(40.02);

    const engineOutput = priceFictionalCompany({
      company,
      now: new Date(`${started.startDate}T16:00:00Z`),
      existingPrice: { price: company.basePrice, change_pct: 0 },
    });
    expect(engineOutput.event.isMajor).toBe(true);
    expect(engineOutput.event.headline).toContain("MAJOR EVENT");
    expect(Math.abs(engineOutput.price.change_pct)).toBeLessThanOrEqual(18);
  });
});
