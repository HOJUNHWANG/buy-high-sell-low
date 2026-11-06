import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachePublicData } from "@/lib/public-data-cache";

vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({
  unstable_cache: (load: (...args: unknown[]) => Promise<unknown>) => {
    const entries = new Map<string, Promise<unknown>>();
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!entries.has(key)) {
        const pending = load(...args);
        entries.set(key, pending);
        pending.catch(() => entries.delete(key));
      }
      return entries.get(key);
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("public data freshness", () => {
  it("shares reads within a minute and awaits new data after the minute changes", async () => {
    const load = vi.fn().mockResolvedValueOnce("old quote");
    const read = cachePublicData(load, ["quotes"], { revalidate: 60, tags: [] });
    expect(await read()).toBe("old quote");
    expect(await read()).toBe("old quote");
    expect(load).toHaveBeenCalledTimes(1);

    let finish!: (value: string) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.setSystemTime(new Date("2026-11-06T12:01:00Z"));
    let settled = false;
    const next = read().then(value => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish("new quote");
    expect(await next).toBe("new quote");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps ticker arguments isolated", async () => {
    const load = vi.fn(async (ticker: string) => `${ticker} quote`);
    const read = cachePublicData(load, ["history"], { revalidate: 60, tags: [] });
    expect(await read("AAPL")).toBe("AAPL quote");
    expect(await read("BTC-USD")).toBe("BTC-USD quote");
    expect(await read("AAPL")).toBe("AAPL quote");
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls).toEqual([["AAPL"], ["BTC-USD"]]);
  });

  it("allows a failed read to recover without caching an empty snapshot", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("outage")).mockResolvedValueOnce([1]);
    const read = cachePublicData(load, ["news"], { revalidate: 60, tags: [] });
    await expect(read()).rejects.toThrow("outage");
    expect(await read()).toEqual([1]);
  });
});
