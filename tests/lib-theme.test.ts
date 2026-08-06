import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_BOOT_SCRIPT,
  THEME_PREFERENCE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEMES,
  isThemeId,
  parseThemePreference,
  readStoredThemePreference,
  readThemePreferenceFromStorage,
  readThemePreferenceFromWindow,
  resolveThemePreference,
  serializeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const earlier = "2026-08-06T12:00:00.000Z";
const later = "2026-08-06T13:00:00.000Z";

function preference(
  theme: ThemePreference["theme"],
  updatedAt = earlier,
  userId: string | null = "user-a",
): ThemePreference {
  return { theme, updatedAt, userId };
}

function themeIdsFromDatabaseCheck(sql: string): string[] {
  const start = sql.indexOf("theme IN (");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(")", start);
  expect(end).toBeGreaterThan(start);
  return [...sql.slice(start, end).matchAll(/'([^']+)'/g)]
    .map((match) => match[1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme configuration", () => {
  it("ships a safe default and all selectable themes", () => {
    expect(DEFAULT_THEME).toBe("midnight");
    expect(THEMES.map((theme) => theme.id)).toEqual([
      "midnight",
      "aurora",
      "dusk",
      "light",
      "white-gold",
      "black-gold",
      "black-red",
      "pastel-light",
      "pastel-rose",
      "pastel-mint",
      "pastel-sky",
      "pastel-peach",
      "pastel-dark",
    ]);
    expect(THEMES.filter((theme) => theme.id.startsWith("pastel-"))).toHaveLength(6);
  });

  it("defines CSS tokens for every non-default theme", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_THEME) continue;
      expect(css).toContain(`[data-theme="${theme.id}"]`);
    }
  });

  it("only accepts known theme identifiers", () => {
    expect(isThemeId("aurora")).toBe(true);
    expect(isThemeId("pastel-rose")).toBe(true);
    expect(isThemeId("pastel-dark")).toBe(true);
    expect(isThemeId("unknown-theme")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("keeps the UI, bootstrap schema, and production allow-list in lockstep", () => {
    const expected = [...THEMES.map((theme) => theme.id)].sort();
    const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260806224343_expand_theme_preferences.sql",
      ),
      "utf8",
    );

    expect(themeIdsFromDatabaseCheck(schema).sort()).toEqual(expected);
    expect(themeIdsFromDatabaseCheck(migration).sort()).toEqual(expected);
  });
});

describe("theme preference persistence", () => {
  it("round-trips a valid versioned preference", () => {
    const stored = preference("pastel-mint", later);
    expect(parseThemePreference(JSON.parse(serializeThemePreference(stored)))).toEqual(stored);
  });

  it("rejects untrusted themes and invalid timestamps", () => {
    expect(parseThemePreference({ theme: "unknown", updatedAt: later, userId: null })).toBeNull();
    expect(parseThemePreference({ theme: "aurora", updatedAt: "not-a-date", userId: null })).toBeNull();
    expect(parseThemePreference({ theme: "aurora", updatedAt: later, userId: 42 })).toBeNull();
  });

  it("migrates the legacy local value with the supplied migration time", () => {
    expect(readStoredThemePreference(null, "pastel-peach", later)).toEqual(
      preference("pastel-peach", later, null),
    );
  });

  it("marks a legacy database-supported value as older than any remote row", () => {
    expect(readStoredThemePreference("{bad json", "dusk", later)).toEqual(
      preference("dusk", "1970-01-01T00:00:00.000Z", null),
    );
  });

  it("does not let a stale legacy Aurora override a newer remote theme", () => {
    const legacy = readStoredThemePreference(null, "aurora", later);
    expect(resolveThemePreference(
      legacy,
      preference("pastel-mint", earlier),
      "user-a",
    )).toEqual({
      preference: preference("pastel-mint", earlier),
      source: "remote",
    });
  });

  it("falls back safely when browser storage access is blocked", () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(readThemePreferenceFromStorage(blockedStorage, later)).toBeNull();
  });

  it("also survives a blocked window.localStorage getter", () => {
    const blockedWindow = Object.defineProperty({}, "localStorage", {
      get: () => { throw new DOMException("blocked", "SecurityError"); },
    }) as { readonly localStorage: { getItem: (key: string) => string | null } };

    expect(readThemePreferenceFromWindow(blockedWindow, later)).toBeNull();
  });

  it("uses the newest preference for the current account", () => {
    const localWins = resolveThemePreference(
      preference("pastel-sky", later, null),
      preference("aurora", earlier),
      "user-a",
    );
    expect(localWins).toEqual({
      preference: preference("pastel-sky", later),
      source: "local",
    });

    const remoteWins = resolveThemePreference(
      preference("midnight", earlier),
      preference("pastel-rose", later),
      "user-a",
    );
    expect(remoteWins).toEqual({
      preference: preference("pastel-rose", later),
      source: "remote",
    });
  });

  it("does not carry another account's local preference into the current account", () => {
    const resolution = resolveThemePreference(
      preference("aurora", later, "user-b"),
      preference("pastel-mint", earlier, "user-a"),
      "user-a",
    );
    expect(resolution).toEqual({
      preference: preference("pastel-mint", earlier, "user-a"),
      source: "remote",
    });
  });
});

describe("pre-hydration theme boot", () => {
  it("applies the versioned local theme before React hydration", () => {
    const dataset: Record<string, string> = {};
    const values = new Map<string, string>([
      [THEME_STORAGE_KEY, "aurora"],
      [THEME_PREFERENCE_STORAGE_KEY, serializeThemePreference(preference("pastel-rose", later))],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
    vi.stubGlobal("document", { documentElement: { dataset } });

    Function(THEME_BOOT_SCRIPT)();

    expect(dataset.theme).toBe("pastel-rose");
  });

  it("ignores invalid storage and leaves the CSS default intact", () => {
    const dataset: Record<string, string> = {};
    const values = new Map<string, string>([
      [THEME_STORAGE_KEY, "unknown-theme"],
      [THEME_PREFERENCE_STORAGE_KEY, JSON.stringify({ theme: "also-unknown" })],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
    vi.stubGlobal("document", { documentElement: { dataset } });

    Function(THEME_BOOT_SCRIPT)();

    expect(dataset.theme).toBeUndefined();
  });
});
