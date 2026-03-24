/**
 * QA Tests: Utility Functions
 * Covers timeAgo, fmtVol, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { timeAgo, fmtVol } from "@/lib/utils";

describe("timeAgo", () => {
  it("returns empty string for null", () => {
    expect(timeAgo(null)).toBe("");
  });

  it("returns 'just now' for < 1 minute", () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns minutes for < 60 minutes", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(timeAgo(thirtyMinAgo)).toBe("30m ago");
  });

  it("returns hours for < 24 hours", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fiveHoursAgo)).toBe("5h ago");
  });

  it("returns days for >= 24 hours", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("returns 1m ago for exactly 1 minute", () => {
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    expect(timeAgo(oneMinAgo)).toBe("1m ago");
  });

  it("returns 1h ago for exactly 60 minutes", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneHourAgo)).toBe("1h ago");
  });

  it("returns 1d ago for exactly 24 hours", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneDayAgo)).toBe("1d ago");
  });
});

describe("fmtVol", () => {
  it("returns dash for null", () => {
    expect(fmtVol(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(fmtVol(undefined)).toBe("—");
  });

  it("returns dash for 0", () => {
    expect(fmtVol(0)).toBe("—");
  });

  it("returns raw number for < 1K", () => {
    expect(fmtVol(500)).toBe("500");
  });

  it("returns K format for thousands", () => {
    expect(fmtVol(1500)).toBe("2K");
  });

  it("returns M format for millions", () => {
    expect(fmtVol(1_234_567)).toBe("1.2M");
  });

  it("returns B format for billions", () => {
    expect(fmtVol(1_500_000_000)).toBe("1.5B");
  });

  it("returns T format for trillions", () => {
    expect(fmtVol(2_500_000_000_000)).toBe("2.5T");
  });

  it("formats exactly 1000 as 1K", () => {
    expect(fmtVol(1000)).toBe("1K");
  });

  it("formats exactly 1M", () => {
    expect(fmtVol(1_000_000)).toBe("1.0M");
  });

  it("formats exactly 1B", () => {
    expect(fmtVol(1_000_000_000)).toBe("1.0B");
  });
});
