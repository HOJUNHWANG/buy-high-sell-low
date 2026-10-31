"use client";
import { useDesign } from "@/components/DesignProvider";
export function DesignToggle() {
  const { design, setDesign } = useDesign();
  return <details className="appearance-preferences relative" onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }}>
    <summary className="cursor-pointer text-xs px-2 py-2 rounded-lg" aria-label="Appearance preferences">Appearance</summary>
    <div className="absolute right-0 top-full z-50 p-3 rounded-lg w-48" style={{ background: "var(--surface-2)", border: "1px solid var(--border-md)" }}>
      <label className="text-xs space-y-2 block">Layout
        <select aria-label="Layout" value={design} onChange={(e) => setDesign(e.target.value as "original" | "2.0")} className="block w-full mt-2 rounded p-2" style={{ background: "var(--surface)", color: "var(--text)" }}>
          <option value="2.0">Workspace</option><option value="original">Original</option>
        </select>
      </label>
    </div>
  </details>;
}
