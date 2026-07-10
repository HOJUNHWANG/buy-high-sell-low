import type { FictionalCompany, FictionalRisk } from "@/data/fictional-market";

export type FictionalPriceSeed = {
  price: number;
  change_pct: number;
  volume: number;
  pe_ratio: number | null;
  dividend_yield: number | null;
};

export type FictionalDailySeed = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FictionalEngineInput = {
  company: FictionalCompany;
  now?: Date;
  existingPrice?: { price: number; change_pct: number | null } | null;
  existingDaily?: FictionalDailySeed | null;
};

export type FictionalEngineOutput = {
  ticker: string;
  marketDate: string;
  price: FictionalPriceSeed;
  daily: FictionalDailySeed;
  marketCap: number;
  event: {
    headline: string;
    impactPct: number;
    severity: "routine" | "material" | "chaotic";
  };
};

const riskMultiplier: Record<FictionalRisk, number> = {
  Low: 0.62,
  Moderate: 0.82,
  High: 1.08,
  Extreme: 1.35,
  Existential: 1.65,
};

const eventTemplates = {
  positive: [
    "secured a contract that widened the market's fantasy TAM model",
    "announced a breakthrough that forced analysts to rewrite the deck",
    "raised guidance after demand outran the base case",
    "won a strategic procurement round with unusually quiet terms",
    "launched a product cycle that pulled forward next-quarter estimates",
  ],
  negative: [
    "fell after a containment headline hit the tape",
    "slipped as regulators opened a review into legacy incidents",
    "delayed a flagship program and blamed classified supply constraints",
    "guided cautiously after security costs surprised the Street",
    "sold off as governance risk returned to the front page",
  ],
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNoise(seed: string, min = -1, max = 1) {
  const x = Math.sin(hashString(seed)) * 10000;
  const fraction = x - Math.floor(x);
  return min + fraction * (max - min);
}

function etParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    date: `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`,
    minutes: get("hour") * 60 + get("minute"),
    halfHourSlot: Math.floor((get("hour") * 60 + get("minute")) / 30),
  };
}

function marketProgress(date: Date) {
  const { minutes } = etParts(date);
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (minutes <= open) return 0.04;
  if (minutes >= close) return 1;
  return Math.min(1, Math.max(0.04, (minutes - open) / (close - open)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number) {
  return Number(Math.max(0.5, value).toFixed(2));
}

function eventChance(risk: FictionalRisk) {
  if (risk === "Existential") return 0.46;
  if (risk === "Extreme") return 0.36;
  if (risk === "High") return 0.24;
  if (risk === "Moderate") return 0.14;
  return 0.08;
}

function dailyTargetReturn(company: FictionalCompany, day: string) {
  const market = seededNoise(`market:${day}`, -0.75, 0.9);
  const sector = seededNoise(`sector:${company.sector}:${day}`, -0.62, 0.62);
  const beta = 0.72 + company.influence / 180;
  const qualityDrift = (company.technology - 78) / 120;
  const companyPulse = seededNoise(`company:${company.ticker}:${day}`, -1, 1) * company.volatility * 0.72;
  const eventRoll = seededNoise(`event-roll:${company.ticker}:${day}`, 0, 1);
  const hasEvent = eventRoll < eventChance(company.risk);
  const eventDirectionBias = (company.technology + company.influence - 170) / 90;
  const eventDirection = seededNoise(`event-dir:${company.ticker}:${day}`, -1, 1) + eventDirectionBias >= 0 ? 1 : -1;
  const eventImpact = hasEvent
    ? eventDirection * seededNoise(`event-impact:${company.ticker}:${day}`, 0.85, company.volatility * 1.15 + 1.2)
    : 0;
  const rawReturn = market * beta + sector + qualityDrift + companyPulse + eventImpact;
  const maxMove = company.risk === "Existential" ? 18 : company.risk === "Extreme" ? 13 : company.risk === "High" ? 9 : 6;

  return {
    pct: clamp(rawReturn * riskMultiplier[company.risk], -maxMove, maxMove),
    eventImpactPct: eventImpact,
  };
}

function buildHeadline(company: FictionalCompany, day: string, impactPct: number) {
  const direction = impactPct >= 0 ? "positive" : "negative";
  const templates = eventTemplates[direction];
  const template = templates[Math.abs(hashString(`headline:${company.ticker}:${day}`)) % templates.length];
  return `${company.name} ${template}.`;
}

export function priceFictionalCompany({
  company,
  now = new Date(),
  existingPrice,
  existingDaily,
}: FictionalEngineInput): FictionalEngineOutput {
  const { date: marketDate, minutes, halfHourSlot } = etParts(now);
  const progress = marketProgress(now);
  const isRegularSession = minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
  const open = existingDaily?.open ?? existingPrice?.price ?? company.basePrice;
  const { pct: targetReturnPct, eventImpactPct } = dailyTargetReturn(company, marketDate);
  const intradayCurve = Math.sin(progress * Math.PI - Math.PI / 2) * 0.5 + 0.5;
  const sessionDamping = isRegularSession ? 1 : 0.55;
  const tickDamping = isRegularSession ? 0.45 : 0.22;
  const intradayNoise = seededNoise(`intraday:${company.ticker}:${marketDate}:${halfHourSlot}`, -0.38, 0.38)
    * company.volatility
    * (1 - progress * 0.35)
    * sessionDamping;
  const halfHourDrift = seededNoise(`tick:${company.ticker}:${marketDate}:${halfHourSlot}`, -0.18, 0.18)
    * company.volatility
    * tickDamping;
  const meanReversion = clamp(((company.basePrice - open) / company.basePrice) * 100, -4, 4) * 0.08;
  const currentReturnPct = targetReturnPct * intradayCurve + intradayNoise + halfHourDrift + meanReversion;
  const price = roundPrice(open * (1 + currentReturnPct / 100));
  const changePct = Number((((price - open) / open) * 100).toFixed(2));
  const volumeBase = company.floatShares * (0.0012 + company.volatility / 1450);
  const volume = Math.max(
    1,
    Math.round(volumeBase * (0.16 + progress * 0.98) * (1 + Math.abs(changePct) / 16))
  );
  const peRatio = company.sector === "Finance" || company.risk === "Existential"
    ? null
    : Number(clamp(18 + company.technology / 6 + changePct * 0.42, 8, 62).toFixed(1));
  const dividendYield = company.sector === "Energy" || company.sector === "Finance" || company.sector === "Industrial"
    ? Number(Math.max(0, 2.3 - changePct * 0.05 + seededNoise(`yield:${company.ticker}:${marketDate}`, -0.35, 0.35)).toFixed(2))
    : null;
  const high = roundPrice(Math.max(existingDaily?.high ?? open, open, price));
  const low = roundPrice(Math.min(existingDaily?.low ?? open, open, price));
  const severity = Math.abs(changePct) >= 7 ? "chaotic" : Math.abs(changePct) >= 3.5 ? "material" : "routine";

  return {
    ticker: company.ticker,
    marketDate,
    price: {
      price,
      change_pct: changePct,
      volume,
      pe_ratio: peRatio,
      dividend_yield: dividendYield,
    },
    daily: {
      open,
      high,
      low,
      close: price,
      volume: Math.max(existingDaily?.volume ?? 0, volume),
    },
    marketCap: Math.round(price * company.floatShares),
    event: {
      headline: buildHeadline(company, marketDate, eventImpactPct || changePct),
      impactPct: changePct,
      severity,
    },
  };
}
