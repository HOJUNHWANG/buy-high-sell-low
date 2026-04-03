/**
 * Vitest global setup — mock Supabase server client and Next.js internals.
 */
import { vi } from "vitest";

// ── Mock next/headers (cookies) ──
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => [],
      set: vi.fn(),
    })
  ),
}));

// ── Supabase mock builder ──
// Creates a chainable mock that mirrors supabase's query builder pattern.
export interface MockUser {
  id: string;
  email?: string;
}

let _mockUser: MockUser | null = null;
let _mockData: Record<string, unknown[]> = {};
let _insertCalls: { table: string; data: unknown }[] = [];
let _updateCalls: { table: string; data: unknown; filters: Record<string, unknown> }[] = [];
let _deleteCalls: { table: string; filters: Record<string, unknown> }[] = [];
let _upsertCalls: { table: string; data: unknown }[] = [];

export function setMockUser(user: MockUser | null) {
  _mockUser = user;
}

export function setMockData(table: string, data: unknown[]) {
  _mockData[table] = data;
}

export function clearMockData() {
  _mockData = {};
  _insertCalls = [];
  _updateCalls = [];
  _deleteCalls = [];
  _upsertCalls = [];
}

export function getInsertCalls() { return _insertCalls; }
export function getUpdateCalls() { return _updateCalls; }
export function getDeleteCalls() { return _deleteCalls; }
export function getUpsertCalls() { return _upsertCalls; }

function createQueryBuilder(table: string, initialData?: unknown[]) {
  let _filters: Record<string, unknown> = {};
  let _data = initialData ?? _mockData[table] ?? [];
  let _selectCount = false;
  let _limit = 100;
  let _ascending = false;
  let _orderField = "";
  let _rangeStart = 0;
  let _rangeEnd = 99;

  const builder: Record<string, unknown> = {
    select: vi.fn((columns?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === "exact") _selectCount = true;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      _filters[col] = val;
      return builder;
    }),
    neq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    in: vi.fn((col: string, vals: unknown[]) => {
      _filters[`${col}_in`] = vals;
      return builder;
    }),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    like: vi.fn(() => builder),
    order: vi.fn((_col: string, opts?: { ascending?: boolean }) => {
      _orderField = _col;
      _ascending = opts?.ascending ?? false;
      return builder;
    }),
    limit: vi.fn((n: number) => {
      _limit = n;
      return builder;
    }),
    range: vi.fn((start: number, end: number) => {
      _rangeStart = start;
      _rangeEnd = end;
      return builder;
    }),
    single: vi.fn(() => {
      // Filter data based on eq filters
      let filtered = [..._data];
      for (const [key, val] of Object.entries(_filters)) {
        if (!key.endsWith("_in")) {
          filtered = filtered.filter((row) => (row as Record<string, unknown>)[key] === val);
        }
      }
      const item = filtered[0] ?? null;
      return Promise.resolve({
        data: item,
        error: item ? null : { message: "not found", code: "PGRST116" },
        count: _selectCount ? filtered.length : undefined,
      });
    }),
    then: undefined as unknown, // will be set below
  };

  // Make builder thenable for queries without .single()
  const resolveData = () => {
    let filtered = [..._data];
    for (const [key, val] of Object.entries(_filters)) {
      if (key.endsWith("_in")) {
        const col = key.replace("_in", "");
        filtered = filtered.filter((row) => (val as unknown[]).includes((row as Record<string, unknown>)[col]));
      } else {
        filtered = filtered.filter((row) => (row as Record<string, unknown>)[key] === val);
      }
    }
    return {
      data: filtered.slice(_rangeStart, _rangeEnd + 1),
      error: null,
      count: _selectCount ? filtered.length : undefined,
    };
  };

  builder.then = (resolve: (val: unknown) => void) => resolve(resolveData());

  return builder;
}

function createMutationBuilder(table: string, type: "insert" | "update" | "delete" | "upsert", payload?: unknown) {
  let _filters: Record<string, unknown> = {};

  if (type === "insert") _insertCalls.push({ table, data: payload });
  if (type === "upsert") _upsertCalls.push({ table, data: payload });

  const builder: Record<string, unknown> = {
    eq: vi.fn((col: string, val: unknown) => {
      _filters[col] = val;
      if (type === "update") {
        _updateCalls.push({ table, data: payload, filters: { ..._filters } });
      }
      if (type === "delete") {
        _deleteCalls.push({ table, filters: { ..._filters } });
      }
      return builder;
    }),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: payload, error: null })),
    then: (resolve: (val: unknown) => void) => resolve({ data: payload, error: null }),
  };

  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: _mockUser },
            error: _mockUser ? null : { message: "not authenticated" },
          })
        ),
      },
      from: vi.fn((table: string) => ({
        select: (...args: unknown[]) => createQueryBuilder(table, _mockData[table]).select(...(args as [string])),
        insert: (data: unknown) => createMutationBuilder(table, "insert", data),
        update: (data: unknown) => createMutationBuilder(table, "update", data),
        delete: () => createMutationBuilder(table, "delete"),
        upsert: (data: unknown, _opts?: unknown) => createMutationBuilder(table, "upsert", data),
      })),
    })
  ),
}));

// ── Mock admin client (service role, used by leaderboard) ──
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: (...args: unknown[]) => createQueryBuilder(table, _mockData[table]).select(...(args as [string])),
      insert: (data: unknown) => createMutationBuilder(table, "insert", data),
      update: (data: unknown) => createMutationBuilder(table, "update", data),
      delete: () => createMutationBuilder(table, "delete"),
      upsert: (data: unknown, _opts?: unknown) => createMutationBuilder(table, "upsert", data),
    })),
  })),
}));

// ── Mock groq-sdk ──
vi.mock("groq-sdk", () => {
  class MockGroq {
    chat = {
      completions: {
        create: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    roast: "Your portfolio is a dumpster fire.",
                    grade: "D-",
                    nickname: "The Bag Holder",
                    summary: "Test summary",
                    impact: "Test impact",
                    sentiment: "neutral",
                    caution: null,
                  }),
                },
              },
            ],
          }),
      },
    };
  }
  return { default: MockGroq };
});
