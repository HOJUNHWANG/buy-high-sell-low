"use client";

import { useDesign } from "@/components/DesignProvider";

export function DesignToggle() {
  const { design, setDesign } = useDesign();
  return (
    <div className="appearance-switch design-switch" role="group" aria-label="Design version">
      <button type="button" aria-pressed={design === "original"} onClick={() => setDesign("original")}>Original</button>
      <button type="button" aria-pressed={design === "2.0"} onClick={() => setDesign("2.0")}>
        <span className="design-dot" />2.0
      </button>
    </div>
  );
}
