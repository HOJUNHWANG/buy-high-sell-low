import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paperWorkspaceHref, resolvePaperView } from "@/lib/paper-workspace";
import { DESIGN_BOOT_SCRIPT, DESIGN_STORAGE_KEY } from "@/lib/design";

const route = vi.hoisted(() => ({ pathname: "/paper", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
import { PaperWorkspace } from "@/components/PaperWorkspace";

afterEach(() => { vi.unstubAllGlobals(); route.pathname = "/paper"; route.search = ""; });

describe("paper trading navigation", () => {
  it("keeps the real portfolio, history and leaderboard routes", () => {
    expect(paperWorkspaceHref()).toBe("/paper");
    expect(paperWorkspaceHref("history")).toBe("/paper/history");
    expect(paperWorkspaceHref("rankings")).toBe("/paper/leaderboard");
    expect(resolvePaperView("/paper/history")).toBe("history");
    expect(resolvePaperView("/paper/leaderboard")).toBe("rankings");
    expect(resolvePaperView("/paper")).toBe("overview");
  });

  it("renders the real account even when an old retired-market URL is opened", () => {
    route.search = "market=fictional&view=history&ticker=ARSK";
    const html = renderToStaticMarkup(createElement(PaperWorkspace, null, createElement("div", null, "Real account")));
    expect(html).toContain("Real account");
    expect(html).toContain('href="/paper/history"');
    expect(html).toContain('href="/paper/leaderboard"');
    expect(html).not.toContain("Fictional");
    expect(html).not.toContain("market=fictional");
  });

  it("preserves the active real history section", () => {
    route.pathname = "/paper/history";
    const html = renderToStaticMarkup(createElement(PaperWorkspace, null, "Trade history"));
    const historyLink = html.match(/<a\b[^>]*href="\/paper\/history"[^>]*>/)?.[0];
    expect(historyLink).toContain('aria-current="page"');
  });
});

describe("design preference bootstrap", () => {
  it("restores 2.0 before hydration without touching the color preference", () => {
    const dataset = { theme: "light" } as Record<string, string>;
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === DESIGN_STORAGE_KEY ? "2.0" : null });
    Function(DESIGN_BOOT_SCRIPT)();
    expect(dataset).toEqual({ theme: "light", design: "2.0" });
  });

  it("survives unavailable storage and invalid saved versions", () => {
    const dataset = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("localStorage", { getItem: () => { throw new DOMException("Blocked", "SecurityError"); } });
    expect(() => Function(DESIGN_BOOT_SCRIPT)()).not.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => "unknown" });
    Function(DESIGN_BOOT_SCRIPT)();
    expect(dataset).toEqual({});
  });
});
