export const THEMES = [
  { id: "midnight", label: "Dark", swatches: ["#060608", "#7c6cfc"] },
  { id: "light", label: "Light", swatches: ["#f5f7fb", "#4f46e5"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "midnight";
export const THEME_STORAGE_KEY = "bhsl-theme";
export const THEME_PREFERENCE_STORAGE_KEY = "bhsl-theme-preference-v2";
const LEGACY_DATABASE_THEME_IDS = new Set<string>([
  "midnight",
  "aurora",
  "dusk",
]);
const LEGACY_SYNCED_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export type ThemePreference = {
  theme: ThemeId;
  updatedAt: string;
  userId: string | null;
};

export type ThemePreferenceResolution = {
  preference: ThemePreference | null;
  source: "local" | "remote" | "default";
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}

// Keep stored account preferences compatible while exposing only two themes.
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  dark: "midnight", aurora: "midnight", dusk: "midnight",
  "black-gold": "midnight", "black-red": "midnight", "pastel-dark": "midnight",
  "white-gold": "light", "pastel-light": "light", "pastel-rose": "light",
  "pastel-mint": "light", "pastel-sky": "light", "pastel-peach": "light",
};

export function normalizeThemeId(value: unknown): ThemeId | null {
  if (isThemeId(value)) return value;
  return typeof value === "string" && Object.hasOwn(LEGACY_THEME_MAP, value)
    ? LEGACY_THEME_MAP[value] : null;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Parse the versioned local preference without trusting storage contents. */
export function parseThemePreference(value: unknown): ThemePreference | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const theme = normalizeThemeId(candidate.theme);
  if (!theme || !isValidTimestamp(candidate.updatedAt)) return null;
  if (candidate.userId !== null && candidate.userId !== undefined && typeof candidate.userId !== "string") {
    return null;
  }

  return {
    theme,
    updatedAt: candidate.updatedAt,
    userId: typeof candidate.userId === "string" && candidate.userId.length > 0
      ? candidate.userId
      : null,
  };
}

/**
 * Read the current preference and migrate the legacy string value in-memory.
 * Themes rejected by the old database constraint get the migration timestamp
 * so that unsynced local intent wins once. Values the old database already
 * accepted are treated as old, preventing a stale legacy Aurora value from
 * replacing a newer preference from another device.
 */
export function readStoredThemePreference(
  serializedPreference: string | null,
  legacyTheme: string | null,
  migratedAt: string,
): ThemePreference | null {
  if (serializedPreference) {
    try {
      const parsed = parseThemePreference(JSON.parse(serializedPreference));
      if (parsed) return parsed;
    } catch {
      // Fall through to the independently stored legacy value.
    }
  }

  const theme = normalizeThemeId(legacyTheme);
  if (!theme || !isValidTimestamp(migratedAt)) return null;
  return {
    theme,
    updatedAt: LEGACY_DATABASE_THEME_IDS.has(legacyTheme ?? "")
      ? LEGACY_SYNCED_TIMESTAMP
      : migratedAt,
    userId: null,
  };
}

type ThemeStorageReader = {
  getItem: (key: string) => string | null;
};

/** Read browser storage without letting SecurityError abort theme hydration. */
export function readThemePreferenceFromStorage(
  storage: ThemeStorageReader,
  migratedAt: string,
): ThemePreference | null {
  try {
    return readStoredThemePreference(
      storage.getItem(THEME_PREFERENCE_STORAGE_KEY),
      storage.getItem(THEME_STORAGE_KEY),
      migratedAt,
    );
  } catch {
    return null;
  }
}

/** Also guard access to the window.localStorage getter itself. */
export function readThemePreferenceFromWindow(
  browser: { readonly localStorage: ThemeStorageReader },
  migratedAt: string,
): ThemePreference | null {
  try {
    return readThemePreferenceFromStorage(browser.localStorage, migratedAt);
  } catch {
    return null;
  }
}

export function serializeThemePreference(preference: ThemePreference): string {
  return JSON.stringify(preference);
}

/**
 * Reconcile this device with the signed-in user's remote preference. Preferences
 * from another account are never allowed to overwrite the current account.
 */
export function resolveThemePreference(
  local: ThemePreference | null,
  remote: ThemePreference | null,
  userId: string,
): ThemePreferenceResolution {
  const localForUser = local && (!local.userId || local.userId === userId) ? local : null;
  const remoteForUser = remote?.userId === userId ? remote : null;

  if (!localForUser && !remoteForUser) return { preference: null, source: "default" };
  if (!localForUser) return { preference: remoteForUser, source: "remote" };
  if (!remoteForUser) {
    return { preference: { ...localForUser, userId }, source: "local" };
  }

  if (Date.parse(localForUser.updatedAt) > Date.parse(remoteForUser.updatedAt)) {
    return { preference: { ...localForUser, userId }, source: "local" };
  }
  return { preference: remoteForUser, source: "remote" };
}

const themeMapForBoot = JSON.stringify({
  ...LEGACY_THEME_MAP,
  midnight: "midnight",
  light: "light",
});

/** Runs before the interactive provider, including migration of retired colors. */
export const THEME_BOOT_SCRIPT = `(()=>{try{const m=${themeMapForBoot};const n=v=>typeof v==="string"&&Object.hasOwn(m,v)?m[v]:null;let t=null;const r=localStorage.getItem(${JSON.stringify(THEME_PREFERENCE_STORAGE_KEY)});if(r){try{const p=JSON.parse(r);if(p&&Number.isFinite(Date.parse(p.updatedAt)))t=n(p.theme)}catch{}}if(!t)t=n(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}));if(t)document.documentElement.dataset.theme=t}catch{}})();`;
