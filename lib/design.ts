export const DESIGN_STORAGE_KEY = "bhsl-design";
export const DEFAULT_DESIGN = "original";
export type DesignVersion = "original" | "2.0";

export function isDesignVersion(value: unknown): value is DesignVersion {
  return value === "original" || value === "2.0";
}

export const DESIGN_BOOT_SCRIPT = `(()=>{try{const d=localStorage.getItem(${JSON.stringify(DESIGN_STORAGE_KEY)});if(d==="original"||d==="2.0")document.documentElement.dataset.design=d}catch{}})();`;
