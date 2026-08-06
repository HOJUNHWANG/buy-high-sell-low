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
let _mockMutationErrors: Record<string, { message: string; code?: string }> = {};
let _mockRpcResults: Record<string, { data: unknown; error: { message: string; code?: string } | null }> = {};

export function setMockUser(user: MockUser | null) {
  _mockUser = user;
}

export function setMockData(table: string, data: unknown[]) {
  _mockData[table] = data;
}

export function setMockMutationError(
  table: string,
  type: "insert" | "update" | "delete" | "upsert",
  error: { message: string; code?: string } | null,
) {
  const key = `${table}:${type}`;
  if (error) _mockMutationErrors[key] = error;
  else delete _mockMutationErrors[key];
}

export function setMockRpcResult(
  name: string,
  result: { data: unknown; error?: { message: string; code?: string } | null } | null,
) {
  if (result) {
    _mockRpcResults[name] = { data: result.data, error: result.error ?? null };
  } else {
    delete _mockRpcResults[name];
  }
}

export function clearMockData() {
  _mockData = {};
  _insertCalls = [];
  _updateCalls = [];
  _deleteCalls = [];
  _upsertCalls = [];
  _mockMutationErrors = {};
  _mockRpcResults = {};
}

export function getInsertCalls() { return _insertCalls; }
export function getUpdateCalls() { return _updateCalls; }
export function getDeleteCalls() { return _deleteCalls; }
export function getUpsertCalls() { return _upsertCalls; }

function createQueryBuilder(table: string, initialData?: unknown[]) {
  const _filters: Record<string, unknown> = {};
  const _ilikeFilters: Array<{ column: string; pattern: string }> = [];
  const _data = initialData ?? _mockData[table] ?? [];
  let _selectCount = false;
  let _rangeStart = 0;
  let _rangeEnd = 99;

  const resolveSingle = () => {
    let filtered = [..._data];
    for (const [key, val] of Object.entries(_filters)) {
      if (!key.endsWith("_in")) {
        filtered = filtered.filter(
          (row) => (row as Record<string, unknown>)[key] === val,
        );
      }
    }
    const item = filtered[0] ?? null;
    return {
      data: item,
      error: item ? null : { message: "not found", code: "PGRST116" },
      count: _selectCount ? filtered.length : undefined,
    };
  };

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
    ilike: vi.fn((column: string, pattern: string) => {
      _ilikeFilters.push({ column, pattern });
      return builder;
    }),
    like: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn((start: number, end: number) => {
      _rangeStart = start;
      _rangeEnd = end;
      return builder;
    }),
    single: vi.fn(() => Promise.resolve(resolveSingle())),
    maybeSingle: vi.fn(() => {
      const result = resolveSingle();
      return Promise.resolve({
        ...result,
        error: result.data ? null : null,
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
    for (const { column, pattern } of _ilikeFilters) {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/[%*]/g, ".*")}$`, "i");
      filtered = filtered.filter((row) =>
        regex.test(String((row as Record<string, unknown>)[column] ?? ""))
      );
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
  const _filters: Record<string, unknown> = {};
  const mutationError = _mockMutationErrors[`${table}:${type}`] ?? null;

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
    single: vi.fn(() => Promise.resolve({ data: mutationError ? null : payload, error: mutationError })),
    then: (resolve: (val: unknown) => void) => resolve({
      data: mutationError ? null : payload,
      error: mutationError,
    }),
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
        upsert: (data: unknown) => createMutationBuilder(table, "upsert", data),
      })),
    })
  ),
}));

// ── Mock admin client (service role, used by leaderboard) ──
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => {
    const rpc = vi.fn((name: string, args?: Record<string, unknown>) => {
      const explicit = _mockRpcResults[name];
      if (explicit) return Promise.resolve(explicit);

      if (name === "claim_summary_unlock") {
        const mutationError = _mockMutationErrors["summary_unlocks:insert"] ?? null;
        if (mutationError?.code === "23505") {
          return Promise.resolve({
            data: [{ outcome: "already_unlocked", remaining: 0 }],
            error: null,
          });
        }
        if (mutationError) return Promise.resolve({ data: null, error: mutationError });

        const userId = args?.p_user_id;
        const dailyLimit = Number(args?.p_daily_limit ?? 0);
        const profile = (_mockData.user_profiles ?? []).find(
          (row) => (row as Record<string, unknown>).user_id === userId,
        ) as Record<string, unknown> | undefined;
        const premium = profile?.tier === "premium";
        const count = (_mockData.summary_unlocks ?? []).filter(
          (row) => (row as Record<string, unknown>).user_id === userId,
        ).length;
        if (!premium && count >= dailyLimit) {
          return Promise.resolve({
            data: [{ outcome: "limit_reached", remaining: 0 }],
            error: null,
          });
        }
        return Promise.resolve({
          data: [{
            outcome: "unlocked",
            remaining: premium ? null : Math.max(dailyLimit - count - 1, 0),
          }],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    return {
      rpc,
      from: vi.fn((table: string) => ({
      select: (...args: unknown[]) => createQueryBuilder(table, _mockData[table]).select(...(args as [string])),
      insert: (data: unknown) => createMutationBuilder(table, "insert", data),
      update: (data: unknown) => createMutationBuilder(table, "update", data),
      delete: () => createMutationBuilder(table, "delete"),
      upsert: (data: unknown) => createMutationBuilder(table, "upsert", data),
      })),
    };
  }),
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
