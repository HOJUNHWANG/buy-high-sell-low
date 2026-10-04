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
  normalizeThemeId,
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
    expect(THEMES.map((theme) => theme.id)).toEqual(["midnight", "light"]);
    expect(THEMES.map((theme) => theme.label)).toEqual(["Dark", "Light"]);
  });

  it("defines CSS tokens for every non-default theme", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_THEME) continue;
      expect(css).toContain(`[data-theme="${theme.id}"]`);
    }
  });

  it("only accepts known theme identifiers", () => {
    expect(isThemeId("midnight")).toBe(true);
    expect(isThemeId("light")).toBe(true);
    expect(isThemeId("aurora")).toBe(false);
    expect(isThemeId("pastel-rose")).toBe(false);
    expect(isThemeId("pastel-dark")).toBe(false);
    expect(isThemeId("unknown-theme")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("keeps both selectable themes compatible with existing database constraints", () => {
    const expected = [...THEMES.map((theme) => theme.id)].sort();
    const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260806224343_expand_theme_preferences.sql",
      ),
      "utf8",
    );

    expect(themeIdsFromDatabaseCheck(schema)).toEqual(expect.arrayContaining(expected));
    expect(themeIdsFromDatabaseCheck(migration)).toEqual(expect.arrayContaining(expected));
  });
});

describe("theme preference persistence", () => {
  it("maps every retired palette into its corresponding dark or light mode", () => {
    for (const theme of ["dark", "aurora", "dusk", "black-gold", "black-red", "pastel-dark"]) {
      expect(normalizeThemeId(theme)).toBe("midnight");
      expect(parseThemePreference({ theme, updatedAt: later, userId: "user-a" })).toEqual(preference("midnight", later));
    }
    for (const theme of ["white-gold", "pastel-light", "pastel-rose", "pastel-mint", "pastel-sky", "pastel-peach"]) {
      expect(normalizeThemeId(theme)).toBe("light");
      expect(parseThemePreference({ theme, updatedAt: later, userId: "user-a" })).toEqual(preference("light", later));
    }
    expect(normalizeThemeId("toString")).toBeNull();
  });

  it("round-trips a valid versioned preference", () => {
    const stored = preference("light", later);
    expect(parseThemePreference(JSON.parse(serializeThemePreference(stored)))).toEqual(stored);
  });

  it("rejects untrusted themes and invalid timestamps", () => {
    expect(parseThemePreference({ theme: "unknown", updatedAt: later, userId: null })).toBeNull();
    expect(parseThemePreference({ theme: "aurora", updatedAt: "not-a-date", userId: null })).toBeNull();
    expect(parseThemePreference({ theme: "aurora", updatedAt: later, userId: 42 })).toBeNull();
  });

  it("migrates the legacy local value with the supplied migration time", () => {
    expect(readStoredThemePreference(null, "pastel-peach", later)).toEqual(
      preference("light", later, null),
    );
  });

  it("marks a legacy database-supported value as older than any remote row", () => {
    expect(readStoredThemePreference("{bad json", "dusk", later)).toEqual(
      preference("midnight", "1970-01-01T00:00:00.000Z", null),
    );
  });

  it("does not let a stale legacy Aurora override a newer remote theme", () => {
    const legacy = readStoredThemePreference(null, "aurora", later);
    expect(resolveThemePreference(
      legacy,
      preference("light", earlier),
      "user-a",
    )).toEqual({
      preference: preference("light", earlier),
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
      preference("light", later, null),
      preference("midnight", earlier),
      "user-a",
    );
    expect(localWins).toEqual({
      preference: preference("light", later),
      source: "local",
    });

    const remoteWins = resolveThemePreference(
      preference("midnight", earlier),
      preference("light", later),
      "user-a",
    );
    expect(remoteWins).toEqual({
      preference: preference("light", later),
      source: "remote",
    });
  });

  it("does not carry another account's local preference into the current account", () => {
    const resolution = resolveThemePreference(
      preference("midnight", later, "user-b"),
      preference("light", earlier, "user-a"),
      "user-a",
    );
    expect(resolution).toEqual({
      preference: preference("light", earlier, "user-a"),
      source: "remote",
    });
  });
});

describe("pre-hydration theme boot", () => {
  it("migrates retired palettes before the first paint", () => {
    const dataset = {};
    vi.stubGlobal("localStorage", { getItem: (key) => key === THEME_STORAGE_KEY ? "black-gold" : JSON.stringify({ theme: "pastel-mint", updatedAt: later }) });
    vi.stubGlobal("document", { documentElement: { dataset } });
    Function(THEME_BOOT_SCRIPT)();
    expect(dataset.theme).toBe("light");
  });

  it("applies the versioned local theme before React hydration", () => {
    const dataset: Record<string, string> = {};
    const values = new Map<string, string>([
      [THEME_STORAGE_KEY, "aurora"],
      [THEME_PREFERENCE_STORAGE_KEY, serializeThemePreference(preference("light", later))],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
    vi.stubGlobal("document", { documentElement: { dataset } });

    Function(THEME_BOOT_SCRIPT)();

    expect(dataset.theme).toBe("light");
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
