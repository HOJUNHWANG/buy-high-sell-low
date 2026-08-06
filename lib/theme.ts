export const THEMES = [
  {
    id: "midnight",
    label: "Midnight",
    description: "Focused dark",
    swatches: ["#060608", "#7c6cfc", "#34d399"],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Cool green",
    swatches: ["#071411", "#2dd4bf", "#67e8f9"],
  },
  {
    id: "dusk",
    label: "Dusk",
    description: "Warm violet",
    swatches: ["#120b1e", "#c084fc", "#f0abfc"],
  },
  {
    id: "light",
    label: "Light",
    description: "Clean and bright",
    swatches: ["#f5f7fb", "#4f46e5", "#0f9f6e"],
  },
  {
    id: "white-gold",
    label: "White & Gold",
    description: "Warm ivory",
    swatches: ["#fffdf7", "#a97912", "#e0bd5a"],
  },
  {
    id: "black-gold",
    label: "Black & Gold",
    description: "Classic luxury",
    swatches: ["#080706", "#d4a72c", "#f2d675"],
  },
  {
    id: "black-red",
    label: "Black & Red",
    description: "Bold contrast",
    swatches: ["#080606", "#dc2626", "#fb7185"],
  },
  {
    id: "pastel-light",
    label: "Light Pastel",
    description: "Soft and airy",
    swatches: ["#fbf8ff", "#8b7bb8", "#e6a8c7"],
  },
  {
    id: "pastel-rose",
    label: "Pastel Rose",
    description: "Blush and berry",
    swatches: ["#fff5f7", "#a64d6a", "#d69aae"],
  },
  {
    id: "pastel-mint",
    label: "Pastel Mint",
    description: "Fresh and calm",
    swatches: ["#f3fbf7", "#3f7f6a", "#91c9b4"],
  },
  {
    id: "pastel-sky",
    label: "Pastel Sky",
    description: "Clear and serene",
    swatches: ["#f4f8ff", "#526f9c", "#9db6d8"],
  },
  {
    id: "pastel-peach",
    label: "Pastel Peach",
    description: "Warm and gentle",
    swatches: ["#fff8f2", "#a75f43", "#dfaa86"],
  },
  {
    id: "pastel-dark",
    label: "Dark Pastel",
    description: "Muted night",
    swatches: ["#17151e", "#b6a4df", "#82c5b6"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "midnight";
export const THEME_STORAGE_KEY = "bhsl-theme";
export const THEME_PREFERENCE_STORAGE_KEY = "bhsl-theme-preference-v2";
const LEGACY_DATABASE_THEME_IDS = new Set<ThemeId>([
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

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Parse the versioned local preference without trusting storage contents. */
export function parseThemePreference(value: unknown): ThemePreference | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (!isThemeId(candidate.theme) || !isValidTimestamp(candidate.updatedAt)) return null;
  if (candidate.userId !== null && candidate.userId !== undefined && typeof candidate.userId !== "string") {
    return null;
  }

  return {
    theme: candidate.theme,
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

  if (!isThemeId(legacyTheme) || !isValidTimestamp(migratedAt)) return null;
  return {
    theme: legacyTheme,
    updatedAt: LEGACY_DATABASE_THEME_IDS.has(legacyTheme)
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

const themeIdsForBoot = JSON.stringify(THEMES.map(({ id }) => id));

/** Runs before the interactive provider to avoid a default-theme flash. */
export const THEME_BOOT_SCRIPT = `(()=>{try{const a=${themeIdsForBoot};let t=null;const r=localStorage.getItem(${JSON.stringify(THEME_PREFERENCE_STORAGE_KEY)});if(r){try{const p=JSON.parse(r);if(p&&a.includes(p.theme))t=p.theme}catch{}}if(!t){const l=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(a.includes(l))t=l}if(t)document.documentElement.dataset.theme=t}catch{}})();`;
