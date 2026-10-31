export const DESIGN_STORAGE_KEY = "bhsl-design";
export const DEFAULT_DESIGN = "2.0";
export type DesignVersion = "original" | "2.0";

export function isDesignVersion(value: unknown): value is DesignVersion {
  return value === "original" || value === "2.0";
}

export const DESIGN_BOOT_SCRIPT = `(()=>{let d="2.0";try{const s=localStorage.getItem(${JSON.stringify(DESIGN_STORAGE_KEY)});if(s==="original"||s==="2.0")d=s}catch{}document.documentElement.dataset.design=d})();`;
