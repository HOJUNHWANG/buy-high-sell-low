import { describe, expect, it } from "vitest";
import { fictionalCompanies, fictionalExchangeOrder } from "@/data/fictional-market";
import { priceFictionalCompany } from "@/lib/fictional-market-engine";

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
});
