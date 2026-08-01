/**
 * Return enough decimal places to keep low-priced crypto quotes meaningful.
 * Equities and ETFs retain conventional cent precision.
 */
export function assetPriceFractionDigits(price: number, ticker?: string): number {
  if (!ticker?.toUpperCase().endsWith("-USD")) return 2;

  const absolutePrice = Math.abs(price);
  if (absolutePrice === 0 || absolutePrice >= 1) return 2;
  if (absolutePrice >= 0.01) return 4;
  if (absolutePrice >= 0.0001) return 6;
  if (absolutePrice >= 0.000001) return 8;
  return 10;
}

export function formatAssetPrice(price: number, ticker?: string): string {
  if (!Number.isFinite(price)) return "—";
  const digits = assetPriceFractionDigits(price, ticker);
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
