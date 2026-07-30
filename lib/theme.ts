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
    id: "pastel-dark",
    label: "Dark Pastel",
    description: "Muted night",
    swatches: ["#17151e", "#b6a4df", "#82c5b6"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "midnight";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}
