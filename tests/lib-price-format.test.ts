import { describe, expect, it } from "vitest";
import { assetPriceFractionDigits, formatAssetPrice } from "@/lib/price-format";

describe("asset price formatting", () => {
  it("keeps conventional cent precision for stocks and ETFs", () => {
    expect(formatAssetPrice(823.034, "MU")).toBe("$823.03");
    expect(formatAssetPrice(0.99894, "PENNY")).toBe("$1.00");
  });

  it("preserves meaningful precision for sub-dollar crypto", () => {
    expect(formatAssetPrice(0.06989, "DOGE-USD")).toBe("$0.0699");
    expect(formatAssetPrice(0.99894, "USDT-USD")).toBe("$0.9989");
    expect(formatAssetPrice(0.06989, "doge-usd")).toBe("$0.0699");
    expect(formatAssetPrice(0.00001234, "SHIB-USD")).toBe("$0.00001234");
  });

  it("uses cent precision for crypto worth at least one dollar", () => {
    expect(formatAssetPrice(118234.567, "BTC-USD")).toBe("$118,234.57");
    expect(assetPriceFractionDigits(118234.567, "BTC-USD")).toBe(2);
  });

  it("does not render non-finite values as prices", () => {
    expect(formatAssetPrice(Number.NaN, "BTC-USD")).toBe("—");
  });
});
