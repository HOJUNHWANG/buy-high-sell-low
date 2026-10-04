"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEMES } from "@/lib/theme";

export function ThemePicker({ mobile = false }: { mobile?: boolean }) {
  const { theme, setTheme } = useTheme();
  return <div className={`appearance-switch theme-switch ${mobile ? "theme-switch-mobile" : ""}`} role="group" aria-label="Color theme">
    {THEMES.map((option) => <button key={option.id} type="button" onClick={() => setTheme(option.id)} aria-pressed={theme === option.id} aria-label={`Use ${option.label} theme`}>
      {option.id === "midnight" ? <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></svg> : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>}
      <span>{option.label}</span>
    </button>)}
  </div>;
}
