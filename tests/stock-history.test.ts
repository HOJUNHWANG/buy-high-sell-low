import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getMarketSnapshot, getStockHistory } from "@/lib/cached-data";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicMarketClient: () => ({ from }) }));
vi.mock("@/lib/public-data-cache", () => ({ cachePublicData: (read: unknown) => read }));

function query(data: unknown) {
  const result = Object.assign(Promise.resolve({ data, error: null }), {
    select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(),
    order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
  });
  for (const method of Object.values(result)) method.mockReturnValue(result);
  return result;
}

beforeEach(() => {
  from.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-21T14:00:00Z"));
});

afterEach(() => vi.useRealTimers());

it("charts Sandisk on a single share basis across the split", async () => {
  from.mockReturnValueOnce(query([
    { price: 79.24, recorded_at: "2026-11-20T21:55:17Z" },
    { price: 754.99, recorded_at: "2026-11-20T00:25:00Z" },
  ])).mockReturnValueOnce(query([
    { date: "2026-11-19", close: 754.99, price_basis: null },
    { date: "2026-11-18", close: 776, price_basis: null },
    { date: "2026-11-17", close: 99, price_basis: "split_adjusted" },
  ]));

  const history = await getStockHistory("SNDK");
  expect(history.map(row => row.price)).toEqual([79.24, 754.99 / 8, 97, 99]);
  expect(history.map(row => row.recorded_at)).not.toContain("2026-11-19");
});

it("loads the rest of the week when continuous quotes reach the API limit", async () => {
  const quotes = Array.from({ length: 1008 }, (_, index) => ({
    price: 80_000 - index,
    recorded_at: new Date(Date.now() - index * 600_000).toISOString(),
  }));
  const remainder = query(quotes.slice(1000));
  from.mockReturnValueOnce(query(quotes.slice(0, 1000)))
    .mockReturnValueOnce(query([]))
    .mockReturnValueOnce(remainder);

  expect(await getStockHistory("BTC-USD")).toEqual(quotes);
  expect(remainder.lt).toHaveBeenCalledWith("recorded_at", quotes[999].recorded_at);
  expect(remainder.gte).toHaveBeenCalledWith("recorded_at", "2026-11-14T14:00:00.000Z");
});

it.each([
  { close: 754.98999, price_basis: null },
  { close: 754.98999 / 8, price_basis: "split_adjusted" },
])("restores a suppressed split-day change using the stored close", async (prior) => {
  from.mockReturnValueOnce(query([{
    ticker: "SNDK",
    stock_prices: { price: 79.24, change_pct: null, provider_session_date: "2026-11-20" },
  }])).mockReturnValueOnce(query(prior));

  const [stock] = await getMarketSnapshot();
  expect(stock.stock_prices?.change_pct).toBeCloseTo(-16.04, 2);
});
