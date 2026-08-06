"use client";

import { THEMES } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useId, useRef, useState } from "react";

export function ThemePicker({ mobile = false }: { mobile?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (mobile) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [mobile]);

  useEffect(() => {
    if (mobile || !open) return;
    const selectedIndex = Math.max(0, THEMES.findIndex((option) => option.id === theme));
    const frame = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mobile, open, theme]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const options = optionRefs.current.filter((option): option is HTMLButtonElement => Boolean(option));
    if (!options.length) return;
    const activeIndex = Math.max(0, options.indexOf(document.activeElement as HTMLButtonElement));
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (activeIndex + 1) % options.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    options[nextIndex]?.focus();
  }

  function handleMobileRadioKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % THEMES.length;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + THEMES.length) % THEMES.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = THEMES.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTheme = THEMES[nextIndex];
    setTheme(nextTheme.id);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  }

  if (!mobile) {
    const activeTheme = THEMES.find((option) => option.id === theme) ?? THEMES[0];
    return (
      <div ref={ref} className="relative hidden lg:block shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="theme-trigger"
          aria-label={`Color theme: ${activeTheme.label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
        >
          <span className="flex gap-0.5" aria-hidden="true">
            {activeTheme.swatches.map((color) => (
              <span key={color} className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            ))}
          </span>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5" />
          </svg>
        </button>

        {open && (
          <div
            id={menuId}
            className="theme-menu"
            role="menu"
            aria-label="Color themes"
            onKeyDown={handleMenuKeyDown}
          >
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Appearance
              </p>
            </div>
            <div className="theme-menu-options px-1.5 pb-1.5">
              {THEMES.map((option, index) => {
                const selected = theme === option.id;
                return (
                  <button
                    key={option.id}
                    ref={(node) => { optionRefs.current[index] = node; }}
                    type="button"
                    onClick={() => {
                      setTheme(option.id);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    role="menuitemradio"
                    aria-checked={selected}
                    className="theme-menu-option"
                    style={{ background: selected ? "var(--surface-3)" : "transparent" }}
                  >
                    <span className="flex gap-1" aria-hidden="true">
                      {option.swatches.map((color) => (
                        <span key={color} className="w-3 h-3 rounded-full" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-xs font-medium" style={{ color: "var(--text)" }}>{option.label}</span>
                      <span className="block text-[10px]" style={{ color: "var(--text-3)" }}>{option.description}</span>
                    </span>
                    {selected && <span className="text-xs" style={{ color: "var(--accent)" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
        Appearance
      </p>
      <div className="grid grid-cols-3 gap-2 px-1 max-h-48 overflow-y-auto overscroll-contain"
        role="radiogroup"
        aria-label="Choose color theme"
      >
        {THEMES.map((option, index) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              onClick={() => setTheme(option.id)}
              onKeyDown={(event) => handleMobileRadioKeyDown(event, index)}
              className="rounded-lg px-2 py-2 text-left transition-colors"
              aria-label={`Use ${option.label} theme`}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              title={`${option.label} — ${option.description}`}
              style={{
                background: selected ? "var(--surface-2)" : "transparent",
                border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              <span className="flex gap-0.5" aria-hidden="true">
                {option.swatches.map((color) => (
                  <span key={color} className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                ))}
              </span>
              <span className="block text-[10px] mt-1" style={{ color: "var(--text-2)" }}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
