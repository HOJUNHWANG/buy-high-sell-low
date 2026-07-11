import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, isThemeId } from "@/lib/theme";

describe("theme configuration", () => {
  it("ships a safe default and multiple selectable themes", () => {
    expect(DEFAULT_THEME).toBe("midnight");
    expect(THEMES.map((theme) => theme.id)).toEqual(["midnight", "aurora", "dusk"]);
  });

  it("only accepts known theme identifiers", () => {
    expect(isThemeId("aurora")).toBe(true);
    expect(isThemeId("unknown-theme")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });
});
