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
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "midnight";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}
