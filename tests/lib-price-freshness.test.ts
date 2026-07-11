import { describe, expect, it } from "vitest";
import { getPriceFreshness } from "@/lib/price-freshness";

describe("price freshness by market state", () => {
  const fridayClose = "2026-07-10T20:00:00Z";
  const weekend = new Date("2026-07-11T16:00:00Z");

  it("shows closed equity prices as last market close, not stale", () => {
    expect(getPriceFreshness(fridayClose, "AAPL", weekend)).toMatchObject({
      state: "settled",
      label: "Last market close",
    });
  });

  it("keeps crypto freshness checks active on weekends", () => {
    expect(getPriceFreshness(fridayClose, "BTC-USD", weekend)).toMatchObject({
      state: "delayed",
      label: "Update delayed",
    });
  });

  it("marks delayed equity prices during regular market hours", () => {
    const marketHours = new Date("2026-07-10T16:00:00Z");
    expect(getPriceFreshness("2026-07-10T15:00:00Z", "AAPL", marketHours)).toMatchObject({
      state: "delayed",
    });
  });
});
