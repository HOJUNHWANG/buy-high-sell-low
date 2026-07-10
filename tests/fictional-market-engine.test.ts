import { describe, expect, it } from "vitest";
import { fictionalCompanies } from "@/data/fictional-market";
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
});
