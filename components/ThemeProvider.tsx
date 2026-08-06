"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_THEME,
  THEME_BOOT_SCRIPT,
  THEME_PREFERENCE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  isThemeId,
  parseThemePreference,
  readThemePreferenceFromWindow,
  resolveThemePreference,
  serializeThemePreference,
  type ThemeId,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}

function persistPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference.theme);
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, serializeThemePreference(preference));
  } catch (error) {
    console.warn("Unable to persist the theme on this device.", error);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Keep the server and the first client render identical. THEME_BOOT_SCRIPT
  // updates CSS before the visible body is parsed, then the effect hydrates state.
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const themeRef = useRef<ThemeId>(DEFAULT_THEME);
  const preferenceRef = useRef<ThemePreference | null>(null);
  const userIdRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const authGenerationRef = useRef(0);
  const accountLoadRef = useRef(0);
  const supabaseRef = useRef<BrowserSupabaseClient | null>(null);
  const remoteSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const getSupabase = useCallback(() => {
    supabaseRef.current ??= createSupabaseBrowserClient();
    return supabaseRef.current;
  }, []);

  const commitPreference = useCallback((preference: ThemePreference, persist = true) => {
    themeRef.current = preference.theme;
    preferenceRef.current = preference;
    applyTheme(preference.theme);
    if (persist) persistPreference(preference);
    setThemeState(preference.theme);
  }, []);

  const queueRemoteSync = useCallback((
    requestedPreference: ThemePreference,
    force = false,
  ) => {
    const requestedRevision = revisionRef.current;
    const requestedAuthGeneration = authGenerationRef.current;

    // Serialize writes and collapse stale selections. The database function
    // also rejects an older cross-device timestamp atomically.
    remoteSyncQueueRef.current = remoteSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const current = preferenceRef.current;
        if (
          !current
          || current.theme !== requestedPreference.theme
          || current.updatedAt !== requestedPreference.updatedAt
          || revisionRef.current !== requestedRevision
          || authGenerationRef.current !== requestedAuthGeneration
        ) {
          return;
        }

        const supabase = getSupabase();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return;

        const userId = authData.user.id;
        if (
          revisionRef.current !== requestedRevision
          || authGenerationRef.current !== requestedAuthGeneration
          || (userIdRef.current !== null && userIdRef.current !== userId)
        ) {
          return;
        }
        userIdRef.current = userId;

        const latest = preferenceRef.current;
        if (
          !latest
          || latest.theme !== requestedPreference.theme
          || latest.updatedAt !== requestedPreference.updatedAt
          || (latest.userId !== null && latest.userId !== userId)
        ) {
          return;
        }

        const preferenceToSync: ThemePreference = { ...latest, userId };
        const { data, error } = await supabase.rpc("set_theme_preference", {
          p_theme: preferenceToSync.theme,
          p_updated_at: preferenceToSync.updatedAt,
          p_force: force,
        });

        if (error) {
          console.warn("Unable to sync the theme preference to the account.", error);
          return;
        }

        if (
          revisionRef.current !== requestedRevision
          || authGenerationRef.current !== requestedAuthGeneration
          || userIdRef.current !== userId
          || preferenceRef.current?.theme !== preferenceToSync.theme
          || preferenceRef.current.updatedAt !== preferenceToSync.updatedAt
        ) {
          return;
        }

        const row = Array.isArray(data) ? data[0] : data;
        const syncedPreference = parseThemePreference({
          theme: row?.theme,
          updatedAt: row?.updated_at,
          userId,
        });
        if (syncedPreference) commitPreference(syncedPreference);
      })
      .catch((error) => {
        console.warn("Unable to sync the theme preference to the account.", error);
      });
  }, [commitPreference, getSupabase]);

  const reconcileAccountPreference = useCallback(async (userId: string) => {
    const loadId = ++accountLoadRef.current;
    const startingRevision = revisionRef.current;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("theme, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (loadId !== accountLoadRef.current || userIdRef.current !== userId) return;
    if (error) {
      console.warn("Unable to load the account theme preference.", error);
      return;
    }

    const current = preferenceRef.current;
    if (revisionRef.current !== startingRevision) {
      if (current && (!current.userId || current.userId === userId)) {
        queueRemoteSync(current);
      }
      return;
    }

    const remotePreference = parseThemePreference({
      theme: data?.theme,
      updatedAt: data?.updated_at,
      userId,
    });
    const resolution = resolveThemePreference(current, remotePreference, userId);

    if (resolution.preference) {
      commitPreference(resolution.preference);
      if (resolution.source === "local") {
        queueRemoteSync(resolution.preference, true);
      }
      return;
    }

    const defaultPreference: ThemePreference = {
      theme: DEFAULT_THEME,
      updatedAt: new Date().toISOString(),
      userId,
    };
    revisionRef.current += 1;
    commitPreference(defaultPreference);
    queueRemoteSync(defaultPreference, true);
  }, [commitPreference, getSupabase, queueRemoteSync]);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    if (!isThemeId(nextTheme)) return;

    revisionRef.current += 1;
    const nextPreference: ThemePreference = {
      theme: nextTheme,
      updatedAt: new Date().toISOString(),
      userId: userIdRef.current,
    };
    commitPreference(nextPreference);
    queueRemoteSync(nextPreference, true);
  }, [commitPreference, queueRemoteSync]);

  useEffect(() => {
    let active = true;
    const initializedAt = new Date().toISOString();
    const localPreference = readThemePreferenceFromWindow(
      window,
      initializedAt,
    );

    const initialTheme = localPreference?.theme ?? DEFAULT_THEME;
    themeRef.current = initialTheme;
    preferenceRef.current = localPreference;
    applyTheme(initialTheme);
    if (localPreference) persistPreference(localPreference);
    queueMicrotask(() => {
      if (active) setThemeState(initialTheme);
    });

    const supabase = getSupabase();
    const initialAuthGeneration = authGenerationRef.current;
    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (
        !active
        || authError
        || !authData.user
        || authGenerationRef.current !== initialAuthGeneration
      ) return;
      userIdRef.current = authData.user.id;
      await reconcileAccountPreference(authData.user.id);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || event === "INITIAL_SESSION") return;
        const nextUserId = session?.user?.id ?? null;
        if (event !== "SIGNED_OUT" && nextUserId === userIdRef.current) return;

        authGenerationRef.current += 1;
        accountLoadRef.current += 1;
        userIdRef.current = nextUserId;
        if (nextUserId) {
          // Supabase recommends keeping auth callbacks synchronous. Reconcile
          // on the next task to avoid lock/deadlock behavior in auth internals.
          setTimeout(() => {
            if (active && userIdRef.current === nextUserId) {
              void reconcileAccountPreference(nextUserId);
            }
          }, 0);
        }
      },
    );

    function handleStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== THEME_PREFERENCE_STORAGE_KEY) return;

      const nextPreference = readThemePreferenceFromWindow(
        window,
        new Date().toISOString(),
      );
      if (!nextPreference) return;
      if (userIdRef.current && nextPreference.userId && nextPreference.userId !== userIdRef.current) return;

      const current = preferenceRef.current;
      if (current && Date.parse(nextPreference.updatedAt) <= Date.parse(current.updatedAt)) return;

      revisionRef.current += 1;
      commitPreference(nextPreference, false);
      queueRemoteSync(nextPreference, true);
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      accountLoadRef.current += 1;
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [commitPreference, getSupabase, queueRemoteSync, reconcileAccountPreference]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return (
    <>
      <script
        id="bhsl-theme-init"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
      />
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
