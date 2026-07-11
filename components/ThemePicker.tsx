"use client";

import { THEMES } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useRef, useState } from "react";

export function ThemePicker({ mobile = false }: { mobile?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobile) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [mobile]);

  if (!mobile) {
    const activeTheme = THEMES.find((option) => option.id === theme) ?? THEMES[0];
    return (
      <div ref={ref} className="relative hidden lg:block shrink-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="theme-trigger"
          aria-label="Choose color theme"
          aria-expanded={open}
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
          <div className="theme-menu" role="menu" aria-label="Color themes">
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Appearance
              </p>
            </div>
            <div className="px-1.5 pb-1.5">
              {THEMES.map((option) => {
                const selected = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setTheme(option.id); setOpen(false); }}
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
      <div className="grid grid-cols-3 gap-2 px-1"
        role="group"
        aria-label="Choose color theme"
      >
        {THEMES.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              className="rounded-lg px-2 py-2 text-left transition-colors"
              aria-label={`Use ${option.label} theme`}
              aria-pressed={selected}
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
