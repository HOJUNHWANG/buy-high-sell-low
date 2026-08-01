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

  it("does not disguise a quote from an older session as the latest close", () => {
    expect(getPriceFreshness("2026-07-09T20:00:00Z", "AAPL", weekend)).toMatchObject({
      state: "delayed",
      label: "Update delayed",
    });
  });

  it("does not call an early-session quote the closing quote", () => {
    expect(getPriceFreshness("2026-07-10T16:00:00Z", "AAPL", weekend)).toMatchObject({
      state: "delayed",
    });
  });

  it("recognizes the session before a holiday weekend as the latest close", () => {
    const independenceDayWeekend = new Date("2026-07-04T16:00:00Z");
    expect(getPriceFreshness("2026-07-02T20:00:00Z", "AAPL", independenceDayWeekend)).toMatchObject({
      state: "settled",
    });
  });

  it("keeps Friday's closing quote settled before Monday's opening bell", () => {
    const mondayPreMarket = new Date("2026-07-13T12:00:00Z");
    expect(getPriceFreshness(fridayClose, "AAPL", mondayPreMarket)).toMatchObject({
      state: "settled",
    });
  });

  it("accepts the completed same-day session after the closing bell", () => {
    const fridayAfterClose = new Date("2026-07-10T21:00:00Z");
    expect(getPriceFreshness("2026-07-10T20:50:00Z", "AAPL", fridayAfterClose)).toMatchObject({
      state: "settled",
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

  it("calculates freshness against the supplied clock", () => {
    const now = new Date("2026-07-10T16:00:00Z");
    expect(getPriceFreshness("2026-07-10T15:50:00Z", "AAPL", now)).toMatchObject({
      state: "live",
      label: "Updated 10m ago",
    });
  });

  it("rejects a quote timestamp materially in the future", () => {
    const now = new Date("2026-07-10T16:00:00Z");
    expect(getPriceFreshness("2026-07-10T16:10:00Z", "BTC-USD", now)).toMatchObject({
      state: "unavailable",
      label: "Invalid quote time",
    });
  });
});
