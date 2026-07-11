"use client";

import { THEMES } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";

export function ThemePicker({ mobile = false }: { mobile?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={mobile ? "space-y-2" : "hidden lg:block"}>
      {mobile && (
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          Appearance
        </p>
      )}
      <div className={mobile ? "grid grid-cols-3 gap-2 px-1" : "flex items-center gap-1 p-1 rounded-lg"}
        role="group"
        aria-label="Choose color theme"
        style={mobile ? undefined : { background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {THEMES.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              className={mobile ? "rounded-lg px-2 py-2 text-left transition-colors" : "w-6 h-6 rounded-md flex items-center justify-center transition-transform hover:scale-110"}
              aria-label={`Use ${option.label} theme`}
              aria-pressed={selected}
              title={`${option.label} — ${option.description}`}
              style={{
                background: mobile && selected ? "var(--surface-2)" : "transparent",
                border: selected ? "1px solid var(--accent)" : mobile ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              <span className="flex gap-0.5" aria-hidden="true">
                {option.swatches.map((color) => (
                  <span key={color} className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                ))}
              </span>
              {mobile && <span className="block text-[10px] mt-1" style={{ color: "var(--text-2)" }}>{option.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
