import { describe, expect, it } from "vitest";
import { fictionalCompanies, fictionalExchangeOrder } from "@/data/fictional-market";
import {
  buildFictionalTapeEventKey,
  buildFictionalTapeHistory,
  priceFictionalCompany,
} from "@/lib/fictional-market-engine";
import {
  getActiveMajorEvents,
  getActiveMajorMarketEvents,
  getMajorEventAftermath,
  getMajorEventCycleStatus,
  getMostRecentMajorMarketEvent,
  majorEventCatalogStats,
} from "@/lib/fictional-major-events";

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

describe("fictional market engine", () => {
  it("keeps one tape snapshot per 30-minute slot instead of overwriting the event history", () => {
    const baseEventKey = "major:scheduled:2026-07-28:quantum-cyberattack:CHOAM";
    const first = buildFictionalTapeEventKey(baseEventKey, new Date("2026-07-31T01:01:00Z"));
    const sameSlot = buildFictionalTapeEventKey(baseEventKey, new Date("2026-07-31T01:29:59Z"));
    const nextSlot = buildFictionalTapeEventKey(baseEventKey, new Date("2026-07-31T01:30:00Z"));

    expect(first).toBe(sameSlot);
    expect(nextSlot).not.toBe(first);
    expect(nextSlot).toContain(":tape-");
  });

  it("fills missing tape slots from price history and prefers event context when available", () => {
    const tape = buildFictionalTapeHistory(
      "CHOAM",
      [
        { price: 1094.49, changePct: -5.23, recordedAt: "2026-07-31T01:30:12.733Z" },
        { price: 1103.53, changePct: -4.45, recordedAt: "2026-07-31T01:00:16.189Z" },
        { price: 1106.04, changePct: -4.23, recordedAt: "2026-07-31T00:30:13.373Z" },
      ],
      [{
        headline: "A quantum exploit hit settlement ledgers.",
        impactPct: -5.23,
        severity: "chaotic",
        eventAt: "2026-07-31T01:30:12.733Z",
      }],
    );

    expect(tape.map((row) => row.impactPct)).toEqual([-5.23, -4.45, -4.23]);
    expect(tape[0].headline).toContain("quantum exploit");
    expect(tape[1].headline).toContain("30-minute fictional tape");
    expect(tape[1].severity).toBe("material");
  });

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
    expect(majorEventCatalogStats.maxDurationDays).toBe(7);
    expect(majorEventCatalogStats.cumulativeImpactCapPct).toBe(40);
  });

  it("adds 1% per eligible midnight, resets on trigger, and pauses during events", () => {
    const starts: NonNullable<ReturnType<typeof getMajorEventCycleStatus>["activeEvent"]>[] = [];
    const firstDay = "2020-01-01";

    for (let offset = 0; offset < 3650; offset += 1) {
      const day = shiftDay(firstDay, offset);
      const status = getMajorEventCycleStatus(day, fictionalCompanies);
      if (status.activeEvent?.startDate === day) starts.push(status.activeEvent);
      if (status.activeEvent?.startDate === day && status.activeEvent.triggerMode === "random") {
        expect(status.rollPct).not.toBeNull();
        expect(status.rollPct ?? 100).toBeLessThan(status.evaluatedProbabilityPct);
      }
      if (status.isActive) {
        expect(status.probabilityPct).toBe(0);
        expect(status.accumulationPaused).toBe(true);
      }
    }

    expect(starts.length).toBeGreaterThan(70);
    expect(starts.length).toBeLessThan(300);
    expect(starts.some((event) => event.triggerMode === "random" && event.triggerProbabilityPct < 100)).toBe(true);
    expect(new Set(starts.map((event) => event.durationDays)).size).toBeGreaterThan(1);
    expect(starts.every((event) => event.durationDays >= 3 && event.durationDays <= 7)).toBe(true);

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

  it("runs the current one-time event for exactly three days, then resumes the normal cycle", () => {
    const current = getMajorEventCycleStatus("2026-07-28", fictionalCompanies);
    expect(current.activeEvent).toMatchObject({
      definitionId: "quantum-cyberattack",
      startDate: "2026-07-28",
      endDate: "2026-07-30",
      durationDays: 3,
      targetTicker: null,
      triggerProbabilityPct: 100,
      triggerMode: "scheduled",
    });

    const finalDay = getMajorEventCycleStatus("2026-07-30", fictionalCompanies);
    expect(finalDay.activeEvent?.eventKey).toBe(current.activeEvent?.eventKey);

    const firstEligibleDay = getMajorEventCycleStatus("2026-07-31", fictionalCompanies);
    expect(firstEligibleDay.evaluatedProbabilityPct).toBe(1);
    expect(firstEligibleDay.probabilityPct).toBeLessThanOrEqual(1);
  });

  it("hides event duration from tape headlines", () => {
    const company = fictionalCompanies.find((item) => item.ticker === "CHOAM") ?? fictionalCompanies[0];
    const event = getActiveMajorEvents(company, "2026-07-30", fictionalCompanies)[0];

    expect(event).toBeDefined();
    expect(event?.headline).toContain("[MAJOR EVENT · Cyberattack]");
    expect(event?.headline).not.toMatch(/Day\s+\d+\/\d+/i);
  });

  it("fades profit-taking and dip-buying across the event's top ten movers", () => {
    const finalDayImpacts = fictionalCompanies.map((company) => ({
      ticker: company.ticker,
      cumulativeImpactPct: getActiveMajorEvents(company, "2026-07-30", fictionalCompanies)[0]
        ?.cumulativeImpactPct ?? 0,
    }));
    const expectedProfitTakers = finalDayImpacts
      .filter((impact) => impact.cumulativeImpactPct > 0)
      .sort((left, right) => right.cumulativeImpactPct - left.cumulativeImpactPct || left.ticker.localeCompare(right.ticker))
      .slice(0, 10)
      .map((impact) => impact.ticker);
    const expectedDipBuyers = finalDayImpacts
      .filter((impact) => impact.cumulativeImpactPct < 0)
      .sort((left, right) => left.cumulativeImpactPct - right.cumulativeImpactPct || left.ticker.localeCompare(right.ticker))
      .slice(0, 10)
      .map((impact) => impact.ticker);
    const firstDayReactions = fictionalCompanies
      .map((company) => getMajorEventAftermath(company, "2026-07-31", fictionalCompanies))
      .filter((aftermath) => aftermath != null);
    const profitTakers = firstDayReactions
      .filter((aftermath) => aftermath.reaction === "profit-taking")
      .sort((left, right) => left.rank - right.rank);
    const dipBuyers = firstDayReactions
      .filter((aftermath) => aftermath.reaction === "dip-buying")
      .sort((left, right) => left.rank - right.rank);

    expect(profitTakers.map((aftermath) => aftermath.ticker)).toEqual(expectedProfitTakers);
    expect(dipBuyers.map((aftermath) => aftermath.ticker)).toEqual(expectedDipBuyers);
    expect(profitTakers.every((aftermath) => aftermath.impactPct < 0 && aftermath.sourceCumulativeImpactPct > 0)).toBe(true);
    expect(dipBuyers.every((aftermath) => aftermath.impactPct > 0 && aftermath.sourceCumulativeImpactPct < 0)).toBe(true);
    expect(profitTakers).toHaveLength(Math.min(10, expectedProfitTakers.length));
    expect(dipBuyers).toHaveLength(Math.min(10, expectedDipBuyers.length));

    const reactionByTicker = new Map(firstDayReactions.map((aftermath) => [aftermath.ticker, aftermath.reaction]));
    const aftermathPrices = fictionalCompanies
      .filter((company) => reactionByTicker.has(company.ticker))
      .map((company) => ({
        reaction: reactionByTicker.get(company.ticker),
        changePct: priceFictionalCompany({
          company,
          now: new Date("2026-07-31T20:00:00Z"),
          existingPrice: { price: company.basePrice, change_pct: 0 },
        }).price.change_pct,
      }));
    const profitTakingPrices = aftermathPrices.filter((price) => price.reaction === "profit-taking");
    const dipBuyingPrices = aftermathPrices.filter((price) => price.reaction === "dip-buying");
    expect(profitTakingPrices.filter((price) => price.changePct < 0).length)
      .toBeGreaterThan(profitTakingPrices.length / 2);
    expect(dipBuyingPrices.filter((price) => price.changePct > 0).length)
      .toBeGreaterThan(dipBuyingPrices.length / 2);

    const sampleCompany = fictionalCompanies.find((company) => (
      getMajorEventAftermath(company, "2026-07-31", fictionalCompanies)?.reaction === "dip-buying"
    ));
    expect(sampleCompany).toBeDefined();
    if (!sampleCompany) return;
    const firstDay = getMajorEventAftermath(sampleCompany, "2026-07-31", fictionalCompanies);
    const secondDay = getMajorEventAftermath(sampleCompany, "2026-08-01", fictionalCompanies);
    expect(secondDay).not.toBeNull();
    expect(Math.abs(secondDay?.impactPct ?? 0)).toBeLessThan(Math.abs(firstDay?.impactPct ?? 0));
  });

  it("keeps the most recent completed event and its cumulative top five visible", () => {
    const recentEvent = getMostRecentMajorMarketEvent(fictionalCompanies, "2026-07-31");
    const finalDayImpacts = fictionalCompanies.map((company) => ({
      ticker: company.ticker,
      cumulativeImpactPct: getActiveMajorEvents(company, "2026-07-30", fictionalCompanies)[0]
        ?.cumulativeImpactPct ?? 0,
    }));
    const expectedGainers = finalDayImpacts
      .filter((impact) => impact.cumulativeImpactPct > 0)
      .sort((left, right) => right.cumulativeImpactPct - left.cumulativeImpactPct || left.ticker.localeCompare(right.ticker))
      .slice(0, 5)
      .map((impact) => impact.ticker);
    const expectedDecliners = finalDayImpacts
      .filter((impact) => impact.cumulativeImpactPct < 0)
      .sort((left, right) => left.cumulativeImpactPct - right.cumulativeImpactPct || left.ticker.localeCompare(right.ticker))
      .slice(0, 5)
      .map((impact) => impact.ticker);

    expect(recentEvent).toMatchObject({
      definitionId: "quantum-cyberattack",
      title: "Quantum Ledger Attack",
      endDate: "2026-07-30",
      daysSinceEnd: 1,
    });
    expect(recentEvent?.topGainers.map((stock) => stock.ticker)).toEqual(expectedGainers);
    expect(recentEvent?.topDecliners.map((stock) => stock.ticker)).toEqual(expectedDecliners);
    expect(recentEvent?.topGainers.every((stock) => (stock.changePct ?? 0) > 0)).toBe(true);
    expect(recentEvent?.topDecliners.every((stock) => (stock.changePct ?? 0) < 0)).toBe(true);
  });

  it("shows at most five gainers and decliners without padding smaller groups", () => {
    const changes = [12, 8, 4, 2, 1, 0.5, 0, -0.2, -1, -2, -3, -4, -8];
    const pricedCompanies = fictionalCompanies.slice(0, changes.length).map((company, index) => ({
      ...company,
      price: 100 + index,
      changePct: changes[index],
    }));
    const event = getActiveMajorMarketEvents(pricedCompanies, "2026-07-28")[0];

    expect(event).toBeDefined();
    expect(event.topGainers.map((stock) => stock.changePct)).toEqual([12, 8, 4, 2, 1]);
    expect(event.topDecliners.map((stock) => stock.changePct)).toEqual([-8, -4, -3, -2, -1]);
    expect([event.gainingCompanies, event.decliningCompanies, event.unchangedCompanies]).toEqual([6, 6, 1]);

    const smallChanges = [2, -1, 0];
    const smallGroup = getActiveMajorMarketEvents(
      fictionalCompanies.slice(0, 3).map((company, index) => ({
        ...company,
        price: 100 + index,
        changePct: smallChanges[index],
      })),
      "2026-07-28",
    )[0];
    expect(smallGroup.topGainers).toHaveLength(1);
    expect(smallGroup.topDecliners).toHaveLength(1);
    expect(smallGroup.unchangedCompanies).toBe(1);
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
