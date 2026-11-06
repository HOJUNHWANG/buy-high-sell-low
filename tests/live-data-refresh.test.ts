import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { LiveDataRefresh } from "@/components/LiveDataRefresh";

const { refresh, lastRequestAt } = vi.hoisted(() => ({ refresh: vi.fn(), lastRequestAt: { current: 0 } }));
vi.mock("react", () => ({ useEffect: vi.fn(), useRef: () => lastRequestAt }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let cleanup: (() => void) | undefined;
let browser: EventTarget;
let page: EventTarget & { visibilityState: string };
let network: { onLine: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  refresh.mockClear();
  lastRequestAt.current = 0;
  browser = Object.assign(new EventTarget(), { setInterval, clearInterval });
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  network = { onLine: true };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
  vi.stubGlobal("navigator", network);
  vi.mocked(useEffect).mockImplementation(effect => {
    const stop = effect();
    if (typeof stop === "function") cleanup = () => { stop(); };
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("server-rendered live data", () => {
  it("refreshes visible data every minute without a duplicate request on fresh entry", () => {
    LiveDataRefresh({ renderedAt: Date.now() });
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("immediately refreshes an old prefetched or restored page", () => {
    LiveDataRefresh({ renderedAt: Date.now() - 120_000 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("pauses hidden tabs and deduplicates their return events", () => {
    LiveDataRefresh({ renderedAt: Date.now() });
    page.visibilityState = "hidden";
    vi.advanceTimersByTime(180_000);
    expect(refresh).not.toHaveBeenCalled();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    browser.dispatchEvent(new Event("focus"));
    browser.dispatchEvent(new Event("pageshow"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recovers when the connection returns", () => {
    LiveDataRefresh({ renderedAt: Date.now() });
    network.onLine = false;
    vi.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
    network.onLine = true;
    browser.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("removes timers and listeners when the route unmounts", () => {
    LiveDataRefresh({ renderedAt: Date.now() });
    cleanup?.();
    cleanup = undefined;
    vi.advanceTimersByTime(120_000);
    for (const type of ["focus", "pageshow", "online"]) browser.dispatchEvent(new Event(type));
    page.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not loop on new server payloads when the client clock is ahead", () => {
    const renderedAt = Date.now() - 120_000;
    LiveDataRefresh({ renderedAt });
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup?.();
    LiveDataRefresh({ renderedAt });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("still refreshes after a minute when the client clock is behind", () => {
    LiveDataRefresh({ renderedAt: Date.now() + 120_000 });
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
