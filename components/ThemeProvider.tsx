"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "bhsl-theme";

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    applyTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      return supabase
        .from("user_preferences")
        .upsert(
          { user_id: user.id, theme: nextTheme, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    });
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    const localTheme = isThemeId(storedTheme) ? storedTheme : DEFAULT_THEME;
    applyTheme(localTheme);

    const supabase = createSupabaseBrowserClient();
    let active = true;
    queueMicrotask(() => {
      if (active) setThemeState(localTheme);
    });
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data } = await supabase
        .from("user_preferences")
        .select("theme")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (isThemeId(data?.theme)) {
        applyTheme(data.theme);
        localStorage.setItem(STORAGE_KEY, data.theme);
        setThemeState(data.theme);
      } else {
        await supabase
          .from("user_preferences")
          .upsert(
            { user_id: user.id, theme: localTheme, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
      }
    });

    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
