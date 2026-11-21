import type { MarketStock } from "@/lib/cached-data";
import { isCrypto } from "@/lib/market-hours";

type Rectangle = { x: number; y: number; width: number; height: number };
type Size = Pick<Rectangle, "width" | "height">;
export type HeatmapLayout = { desktop: Rectangle; mobile: Rectangle };

const desktopSize = { width: 16, height: 9 };
const mobileSize = { width: 5, height: 8 };

export type HeatmapStock = {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number | null;
  change: number | null;
  quotedAt: number | null;
};

type WeightedStock = HeatmapStock & { weight: number };
type Sector = { name: string; weight: number; stocks: WeightedStock[] };

export const heatmapQuoteTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

function splitRectangle(rectangle: Rectangle, size: Size, fraction: number): [Rectangle, Rectangle] {
  const { x, y, width, height } = rectangle;
  if (width * size.width >= height * size.height) {
    const split = width * fraction;
    return [
      { x, y, width: split, height },
      { x: x + split, y, width: width - split, height },
    ];
  }

  const split = height * fraction;
  return [
    { x, y, width, height: split },
    { x, y: y + split, width, height: height - split },
  ];
}

function treemap<T extends { weight: number }>(items: T[], desktop: Size, mobile: Size) {
  const ordered = [...items].sort((left, right) => right.weight - left.weight);
  const tiles: (HeatmapLayout & { item: T })[] = [];

  // Divide near half the market cap along the longer side to keep tiles compact.
  function place(start: number, end: number, weight: number, layout: HeatmapLayout) {
    if (end - start === 1) {
      tiles.push({ ...layout, item: ordered[start] });
      return;
    }

    let middle = start + 1;
    let firstWeight = ordered[start].weight;
    while (middle < end - 1 && firstWeight + ordered[middle].weight / 2 < weight / 2) {
      firstWeight += ordered[middle++].weight;
    }

    const fraction = firstWeight / weight;
    const [desktopFirst, desktopSecond] = splitRectangle(layout.desktop, desktop, fraction);
    const [mobileFirst, mobileSecond] = splitRectangle(layout.mobile, mobile, fraction);
    place(start, middle, firstWeight, { desktop: desktopFirst, mobile: mobileFirst });
    place(middle, end, weight - firstWeight, { desktop: desktopSecond, mobile: mobileSecond });
  }

  if (ordered.length) {
    const bounds = { x: 0, y: 0, width: 1, height: 1 };
    place(0, ordered.length, ordered.reduce((sum, item) => sum + item.weight, 0), { desktop: bounds, mobile: bounds });
  }
  return tiles;
}

export function getHeatmapStocks(snapshot: readonly MarketStock[]) {
  const stocks: HeatmapStock[] = [];
  let latestQuote: number | null = null;

  for (const stock of snapshot) {
    const { ticker, sector, market_cap: cap, market_cap_metric: metric, stock_prices: quote } = stock;
    if (!stock.is_active || sector === "ETF" || sector === "Cryptocurrency" || isCrypto(ticker)
      || metric === "aum" || metric === "circulating_market_cap") continue;

    const timestamp = Date.parse(quote?.fetched_at ?? "");
    const quotedAt = Number.isFinite(timestamp) ? timestamp : null;
    const change = quote?.change_pct;
    const label = sector?.trim();
    // Existing quotes use Technology, while newer listings can use the GICS label.
    stocks.push({
      ticker,
      name: stock.name,
      sector: label === "Information Technology" ? "Technology" : label || "Unclassified",
      marketCap: cap != null && Number.isFinite(cap) && cap > 0 ? cap : null,
      change: typeof change === "number" && Number.isFinite(change) ? change : null,
      quotedAt,
    });
    if (quotedAt != null && (latestQuote == null || quotedAt > latestQuote)) {
      latestQuote = quotedAt;
    }
  }
  return { stocks, latestQuote };
}

export function getMarketHeatmap(stocks: readonly HeatmapStock[]) {
  const sectors = new Map<string, Sector>();
  const withoutMarketCap: HeatmapStock[] = [];

  for (const stock of stocks) {
    const { sector, marketCap } = stock;
    if (marketCap == null) {
      withoutMarketCap.push(stock);
      continue;
    }
    const group: Sector = sectors.get(sector) ?? { name: sector, weight: 0, stocks: [] };
    group.weight += marketCap;
    group.stocks.push({ ...stock, weight: marketCap });
    sectors.set(sector, group);
  }

  const groups = treemap([...sectors.values()], desktopSize, mobileSize).map(({ item, desktop, mobile }) => ({
    name: item.name,
    desktop,
    mobile,
    stocks: treemap(item.stocks, {
      width: desktop.width * desktopSize.width,
      height: desktop.height * desktopSize.height,
    }, {
      width: mobile.width * mobileSize.width,
      height: mobile.height * mobileSize.height,
    }),
  }));

  return { groups, withoutMarketCap };
}
