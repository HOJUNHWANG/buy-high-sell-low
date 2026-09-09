export const SP100_EFFECTIVE_AT = "2026-09-21T04:00:00Z";
export const SP100_ADDITIONS = ["DELL", "PANW", "ANET", "SNDK"] as const;
export const SP100_REMOVALS = ["HONA", "NKE", "SPG", "CL"] as const;

export type IndexNotice = { kind: "addition" | "removal"; label: string };

export function pendingIndexAdditions(now = new Date()): readonly string[] {
  return now.getTime() < Date.parse(SP100_EFFECTIVE_AT) ? SP100_ADDITIONS : [];
}

export function discoveryFilter(now = new Date()): string {
  const pending = pendingIndexAdditions(now);
  return pending.length
    ? `is_active.eq.true,ticker.in.(${pending.join(",")})`
    : "is_active.eq.true";
}

export function isDiscoverableStock(stock: { ticker: string; is_active: boolean }, now = new Date()): boolean {
  return stock.is_active || pendingIndexAdditions(now).includes(stock.ticker);
}

export function getIndexNotice(ticker: string, now = new Date()): IndexNotice | null {
  if (now.getTime() >= Date.parse(SP100_EFFECTIVE_AT)) return null;
  if ((SP100_ADDITIONS as readonly string[]).includes(ticker)) {
    return { kind: "addition", label: "Joins S&P 100 · Sep 21" };
  }
  if ((SP100_REMOVALS as readonly string[]).includes(ticker)) {
    return { kind: "removal", label: "Leaves S&P 100 · Sep 21" };
  }
  return null;
}
