import { describe, expect, it } from "vitest";
import { discoveryFilter, getIndexNotice, isDiscoverableStock, pendingIndexAdditions, SP100_ADDITIONS, SP100_REMOVALS } from "../lib/sp100-transition";

describe("announced index changes", () => {
  const before = new Date("2026-09-21T03:59:59Z");
  const after = new Date("2026-09-21T04:00:00Z");
  it("previews all four additions without activating trading membership", () => {
    expect(pendingIndexAdditions(before)).toHaveLength(4);
    for (const ticker of SP100_ADDITIONS) {
      expect(isDiscoverableStock({ ticker, is_active: false }, before)).toBe(true);
      expect(getIndexNotice(ticker, before)?.kind).toBe("addition");
    }
    expect(isDiscoverableStock({ ticker: "HON", is_active: false }, before)).toBe(false);
    expect(discoveryFilter(before)).toContain("ticker.in.(DELL,PANW,ANET,SNDK)");
  });
  it("marks every outgoing member until Eastern midnight", () => {
    for (const ticker of SP100_REMOVALS) {
      expect(getIndexNotice(ticker, before)?.label).toContain("Leaves S&P 100 · Sep 21");
      expect(getIndexNotice(ticker, after)).toBeNull();
      expect(isDiscoverableStock({ ticker, is_active: false }, after)).toBe(false);
    }
  });
  it("uses verified database membership after the boundary, including delayed sync", () => {
    expect(pendingIndexAdditions(after)).toEqual([]);
    expect(discoveryFilter(after)).toBe("is_active.eq.true");
    expect(isDiscoverableStock({ ticker: "DELL", is_active: false }, after)).toBe(false);
    expect(isDiscoverableStock({ ticker: "DELL", is_active: true }, after)).toBe(true);
    expect(isDiscoverableStock({ ticker: "NKE", is_active: true }, after)).toBe(true);
    expect(getIndexNotice("DELL", after)).toBeNull();
    expect(getIndexNotice("AAPL", before)).toBeNull();
  });
});
