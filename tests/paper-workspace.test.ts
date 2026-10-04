import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paperWorkspaceHref, resolvePaperView } from "@/lib/paper-workspace";
import { DESIGN_BOOT_SCRIPT, DESIGN_STORAGE_KEY } from "@/lib/design";

const route = vi.hoisted(() => ({ pathname: "/paper", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("@/components/FictionalPaperDesk", () => ({
  FictionalPaperDesk: ({ initialTicker, view }: { initialTicker?: string; view: string }) => createElement("div", { "data-fictional-ticker": initialTicker, "data-fictional-view": view }, "Fictional account"),
}));
import { PaperWorkspace } from "@/components/PaperWorkspace";
import FictionalPaperPage from "@/app/fictional-market/paper/page";

afterEach(() => { vi.unstubAllGlobals(); route.pathname = "/paper"; route.search = ""; });

describe("unified paper trading navigation", () => {
  it("keeps history and rankings in the selected market", () => {
    expect(paperWorkspaceHref("real", "history")).toBe("/paper/history");
    expect(paperWorkspaceHref("real", "rankings")).toBe("/paper/leaderboard");
    expect(paperWorkspaceHref("fictional", "history")).toBe("/paper?market=fictional&view=history");
    expect(paperWorkspaceHref("fictional", "rankings")).toBe("/paper?market=fictional&view=rankings");
    expect(resolvePaperView("/paper/history", null)).toBe("history");
    expect(resolvePaperView("/paper", "rankings")).toBe("rankings");
    expect(resolvePaperView("/paper", "untrusted")).toBe("overview");
  });

  it("renders only the selected account and preserves the ticker in section links", () => {
    route.search = "market=fictional&view=history&ticker=wynn";
    const html = renderToStaticMarkup(createElement(PaperWorkspace, null, createElement("div", null, "Real account")));
    expect(html).toContain("Fictional account");
    expect(html).not.toContain("Real account");
    expect(html).toContain('data-fictional-ticker="WYNN"');
    expect(html).toContain('data-fictional-view="history"');
    expect(html).toContain("/paper?market=fictional&amp;view=rankings&amp;ticker=WYNN");
  });

  it("renders the real account for missing or invalid market parameters", () => {
    route.search = "market=invalid";
    const html = renderToStaticMarkup(createElement(PaperWorkspace, null, createElement("div", null, "Real account")));
    expect(html).toContain("Real account");
    expect(html).not.toContain('data-fictional-view');
  });

  it("redirects existing Fictional trade links without dropping the selected ticker", async () => {
    await expect(FictionalPaperPage({ searchParams: Promise.resolve({ ticker: "wynn" }) })).rejects.toThrow("REDIRECT:/paper?market=fictional&ticker=WYNN");
    await expect(FictionalPaperPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/paper?market=fictional");
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
