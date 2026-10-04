"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_DESIGN, DESIGN_STORAGE_KEY, isDesignVersion, type DesignVersion } from "@/lib/design";

const DesignContext = createContext<{ design: DesignVersion; setDesign: (design: DesignVersion) => void } | null>(null);

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const [design, setDesignState] = useState<DesignVersion>(DEFAULT_DESIGN);
  const setDesign = useCallback((next: DesignVersion) => {
    if (!isDesignVersion(next)) return;
    document.documentElement.dataset.design = next;
    setDesignState(next);
    try { localStorage.setItem(DESIGN_STORAGE_KEY, next); } catch { /* Device storage is optional. */ }
  }, []);

  useEffect(() => {
    const initial = document.documentElement.dataset.design;
    queueMicrotask(() => setDesignState(isDesignVersion(initial) ? initial : DEFAULT_DESIGN));
    function sync(event: StorageEvent) {
      if (event.key !== DESIGN_STORAGE_KEY && event.key !== null) return;
      const next = isDesignVersion(event.newValue) ? event.newValue : DEFAULT_DESIGN;
      document.documentElement.dataset.design = next;
      setDesignState(next);
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const value = useMemo(() => ({ design, setDesign }), [design, setDesign]);
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

export function useDesign() {
  const context = useContext(DesignContext);
  if (!context) throw new Error("useDesign must be used within DesignProvider");
  return context;
}
