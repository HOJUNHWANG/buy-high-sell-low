import majorEventConfigJson from "@/data/fictional-major-events.json";
import type { FictionalCompany, FictionalRisk, FictionalSector } from "@/data/fictional-market";

type MajorEventScope = "world" | "company";

type MajorEventDefinition = {
  id: string;
  scope: MajorEventScope;
  category: string;
  title: string;
  headline: string;
  durationDays: [number, number];
  impactPct: [number, number];
  volatility: [number, number];
  broadImpact?: number;
  sectorImpacts?: Partial<Record<FictionalSector, number>>;
  targetImpact?: -1 | 1;
};

type MajorEventConfig = {
  version: number;
  cycle: {
    anchorDate: string;
    dailyProbabilityIncrementPct: number;
    minDurationDays: number;
    maxDurationDays: number;
    cumulativeImpactCapPct: number;
  };
  events: MajorEventDefinition[];
};

type InternalCycleEvent = {
  eventKey: string;
  definitionId: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  targetIndex: number;
  triggerProbabilityPct: number;
};

type InternalCycleState = {
  marketDate: string;
  probabilityPct: number;
  evaluatedProbabilityPct: number;
  rollPct: number | null;
  activeEvent: InternalCycleEvent | null;
  lastEventEndDate: string | null;
};

export type ActiveMajorEvent = {
  eventKey: string;
  definitionId: string;
  scope: MajorEventScope;
  category: string;
  title: string;
  headline: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  dayNumber: number;
  daysRemaining: number;
  targetTicker: string | null;
  triggerProbabilityPct: number;
  currentImpactPct: number;
  cumulativeImpactPct: number;
  cumulativeImpactCapPct: number;
  volatilityBoost: number;
  volumeMultiplier: number;
};

export type MajorEventImpact = {
  impactPct: number;
  cumulativeImpactPct: number;
  volatilityBoost: number;
  volumeMultiplier: number;
  activeEvents: ActiveMajorEvent[];
  primaryEvent: ActiveMajorEvent | null;
};

export type MarketMajorEventSummary = {
  eventKey: string;
  category: string;
  title: string;
  headline: string;
  scope: MajorEventScope;
  startDate: string;
  endDate: string;
  durationDays: number;
  dayNumber: number;
  daysRemaining: number;
  targetTicker: string | null;
  triggerProbabilityPct: number;
  affectedCompanies: number;
  affectedSectors: FictionalSector[];
  largestMovePct: number;
  largestCumulativeImpactPct: number;
  cumulativeImpactCapPct: number;
};

export type MajorEventCycleStatus = {
  marketDate: string;
  probabilityPct: number;
  evaluatedProbabilityPct: number;
  rollPct: number | null;
  isActive: boolean;
  accumulationPaused: boolean;
  nextProbabilityPct: number;
  nextEvaluationDate: string;
  accumulationResumesOn: string | null;
  lastEventEndDate: string | null;
  activeEvent: {
    eventKey: string;
    title: string;
    category: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    targetTicker: string | null;
    triggerProbabilityPct: number;
  } | null;
};

const config = majorEventConfigJson as MajorEventConfig;
const definitionsById = new Map(config.events.map((event) => [event.id, event]));
const worldEvents = config.events.filter((event) => event.scope === "world");
const companyEvents = config.events.filter((event) => event.scope === "company");

const riskSensitivity: Record<FictionalRisk, number> = {
  Low: 0.78,
  Moderate: 0.9,
  High: 1.04,
  Extreme: 1.18,
  Existential: 1.32,
};

const cycleStateCache = new Map<string, InternalCycleState>();
let simulatedThrough = shiftDate(config.cycle.anchorDate, -1);
let simulatedProbabilityPct = 0;
let simulatedActiveEvent: InternalCycleEvent | null = null;
let simulatedLastEventEndDate: string | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 4) {
  return Number(value.toFixed(places));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNoise(seed: string, min = -1, max = 1) {
  const x = Math.sin(hashString(seed)) * 10000;
  const fraction = x - Math.floor(x);
  return min + fraction * (max - min);
}

function integerFromSeed(seed: string, min: number, max: number) {
  return Math.floor(seededNoise(seed, min, max + 1));
}

function marketDateKey(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(day: string, offsetDays: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  return Math.round(
    (new Date(`${endDate}T12:00:00Z`).getTime() - new Date(`${startDate}T12:00:00Z`).getTime())
      / (24 * 60 * 60 * 1000),
  );
}

function pickDefinition(seed: string) {
  return config.events[Math.abs(hashString(seed)) % config.events.length];
}

function eventTargetTicker(event: InternalCycleEvent, companies: FictionalCompany[]) {
  const definition = definitionsById.get(event.definitionId);
  if (definition?.scope !== "company" || companies.length === 0) return null;
  const stableTickerOrder = companies.map((company) => company.ticker).sort((a, b) => a.localeCompare(b));
  return stableTickerOrder[event.targetIndex % stableTickerOrder.length] ?? null;
}

function ensureCycleSimulatedThrough(targetDate: string) {
  if (targetDate < config.cycle.anchorDate) {
    return {
      marketDate: targetDate,
      probabilityPct: 0,
      evaluatedProbabilityPct: 0,
      rollPct: null,
      activeEvent: null,
      lastEventEndDate: null,
    } satisfies InternalCycleState;
  }

  while (simulatedThrough < targetDate) {
    const marketDate = shiftDate(simulatedThrough, 1);

    if (simulatedActiveEvent && marketDate <= simulatedActiveEvent.endDate) {
      cycleStateCache.set(marketDate, {
        marketDate,
        probabilityPct: 0,
        evaluatedProbabilityPct: 0,
        rollPct: null,
        activeEvent: simulatedActiveEvent,
        lastEventEndDate: simulatedLastEventEndDate,
      });
      simulatedThrough = marketDate;
      continue;
    }

    if (simulatedActiveEvent) {
      simulatedLastEventEndDate = simulatedActiveEvent.endDate;
      simulatedActiveEvent = null;
    }

    const evaluatedProbabilityPct = clamp(
      simulatedProbabilityPct + config.cycle.dailyProbabilityIncrementPct,
      0,
      100,
    );
    const rollPct = seededNoise(`major:cycle:roll:${marketDate}`, 0, 100);

    if (rollPct < evaluatedProbabilityPct) {
      const definition = pickDefinition(`major:cycle:type:${marketDate}`);
      const eventKey = `major:cycle:${marketDate}:${definition.id}`;
      const durationDays = integerFromSeed(
        `${eventKey}:duration`,
        config.cycle.minDurationDays,
        config.cycle.maxDurationDays,
      );
      simulatedActiveEvent = {
        eventKey,
        definitionId: definition.id,
        startDate: marketDate,
        endDate: shiftDate(marketDate, durationDays - 1),
        durationDays,
        targetIndex: hashString(`${eventKey}:target`),
        triggerProbabilityPct: evaluatedProbabilityPct,
      };
      simulatedProbabilityPct = 0;
    } else {
      simulatedProbabilityPct = evaluatedProbabilityPct;
    }

    cycleStateCache.set(marketDate, {
      marketDate,
      probabilityPct: simulatedActiveEvent ? 0 : simulatedProbabilityPct,
      evaluatedProbabilityPct,
      rollPct: round(rollPct),
      activeEvent: simulatedActiveEvent,
      lastEventEndDate: simulatedLastEventEndDate,
    });
    simulatedThrough = marketDate;
  }

  return cycleStateCache.get(targetDate) ?? null;
}

function rawDailyImpact(
  definition: MajorEventDefinition,
  event: InternalCycleEvent,
  company: FictionalCompany,
  elapsedDays: number,
) {
  const progress = event.durationDays <= 1 ? 1 : elapsedDays / (event.durationDays - 1);
  const magnitude = seededNoise(`${event.eventKey}:magnitude`, definition.impactPct[0], definition.impactPct[1]);
  const volatility = seededNoise(`${event.eventKey}:volatility`, definition.volatility[0], definition.volatility[1]);
  const shockDecay = 0.34 + 0.66 * Math.exp(-2.1 * progress);
  const turbulenceCurve = 0.58 + 0.42 * Math.sin(Math.PI * progress);
  const exposure = definition.scope === "company"
    ? definition.targetImpact ?? -1
    : (definition.broadImpact ?? 0) + (definition.sectorImpacts?.[company.sector] ?? 0);
  const sensitivity = riskSensitivity[company.risk] * (0.9 + company.volatility / 28);
  const directionalImpact = magnitude * exposure * shockDecay * sensitivity;
  const day = shiftDate(event.startDate, elapsedDays);
  const whipsaw = seededNoise(`${event.eventKey}:${company.ticker}:${day}:whipsaw`, -1, 1)
    * magnitude
    * volatility
    * turbulenceCurve
    * 0.34
    * sensitivity;

  return {
    impactPct: clamp(directionalImpact + whipsaw, -12, 12),
    volatilityBoost: clamp(volatility * turbulenceCurve * (0.72 + Math.abs(exposure) * 0.22), 0.25, 2.2),
  };
}

function cappedImpactPath(
  definition: MajorEventDefinition,
  event: InternalCycleEvent,
  company: FictionalCompany,
  throughElapsedDay: number,
) {
  let cumulativeFactor = 1;
  let currentImpactPct = 0;
  let volatilityBoost = 0;

  for (let elapsedDay = 0; elapsedDay <= throughElapsedDay; elapsedDay += 1) {
    const raw = rawDailyImpact(definition, event, company, elapsedDay);
    const proposedFactor = cumulativeFactor * (1 + raw.impactPct / 100);
    const boundedCumulativePct = clamp(
      (proposedFactor - 1) * 100,
      -config.cycle.cumulativeImpactCapPct,
      config.cycle.cumulativeImpactCapPct,
    );
    const boundedFactor = 1 + boundedCumulativePct / 100;
    currentImpactPct = (boundedFactor / cumulativeFactor - 1) * 100;
    cumulativeFactor = boundedFactor;
    volatilityBoost = raw.volatilityBoost;
  }

  return {
    currentImpactPct: round(currentImpactPct),
    cumulativeImpactPct: round((cumulativeFactor - 1) * 100),
    volatilityBoost: round(volatilityBoost),
  };
}

function buildActiveEvent(
  definition: MajorEventDefinition,
  event: InternalCycleEvent,
  currentDate: string,
  company: FictionalCompany,
  targetTicker: string | null,
): ActiveMajorEvent | null {
  const elapsedDays = daysBetween(event.startDate, currentDate);
  if (elapsedDays < 0 || elapsedDays >= event.durationDays) return null;
  if (definition.scope === "company" && company.ticker !== targetTicker) return null;

  const impact = cappedImpactPath(definition, event, company, elapsedDays);
  const dayNumber = elapsedDays + 1;
  const baseHeadline = definition.headline.replaceAll("{company}", company.name);

  return {
    eventKey: event.eventKey,
    definitionId: definition.id,
    scope: definition.scope,
    category: definition.category,
    title: definition.title,
    headline: `[MAJOR EVENT · ${definition.category} · Day ${dayNumber}/${event.durationDays}] ${baseHeadline}`,
    startDate: event.startDate,
    endDate: event.endDate,
    durationDays: event.durationDays,
    dayNumber,
    daysRemaining: event.durationDays - dayNumber,
    targetTicker,
    triggerProbabilityPct: event.triggerProbabilityPct,
    currentImpactPct: impact.currentImpactPct,
    cumulativeImpactPct: impact.cumulativeImpactPct,
    cumulativeImpactCapPct: config.cycle.cumulativeImpactCapPct,
    volatilityBoost: impact.volatilityBoost,
    volumeMultiplier: round(clamp(1 + Math.abs(impact.currentImpactPct) / 5 + impact.volatilityBoost * 0.55, 1.2, 4), 3),
  };
}

export function getMajorEventCycleStatus(
  date: Date | string = new Date(),
  companies: FictionalCompany[] = [],
): MajorEventCycleStatus {
  const marketDate = marketDateKey(date);
  const state = ensureCycleSimulatedThrough(marketDate);
  const internalEvent = state?.activeEvent ?? null;
  const definition = internalEvent ? definitionsById.get(internalEvent.definitionId) ?? null : null;
  const targetTicker = internalEvent ? eventTargetTicker(internalEvent, companies) : null;
  const isActive = internalEvent != null;
  const accumulationResumesOn = internalEvent ? shiftDate(internalEvent.endDate, 1) : null;
  const isFinalEventDay = internalEvent?.endDate === marketDate;

  return {
    marketDate,
    probabilityPct: state?.probabilityPct ?? 0,
    evaluatedProbabilityPct: state?.evaluatedProbabilityPct ?? 0,
    rollPct: state?.rollPct ?? null,
    isActive,
    accumulationPaused: isActive,
    nextProbabilityPct: isActive
      ? (isFinalEventDay ? config.cycle.dailyProbabilityIncrementPct : 0)
      : clamp((state?.probabilityPct ?? 0) + config.cycle.dailyProbabilityIncrementPct, 0, 100),
    nextEvaluationDate: shiftDate(marketDate, 1),
    accumulationResumesOn,
    lastEventEndDate: state?.lastEventEndDate ?? null,
    activeEvent: internalEvent && definition
      ? {
          eventKey: internalEvent.eventKey,
          title: definition.title,
          category: definition.category,
          startDate: internalEvent.startDate,
          endDate: internalEvent.endDate,
          durationDays: internalEvent.durationDays,
          targetTicker,
          triggerProbabilityPct: internalEvent.triggerProbabilityPct,
        }
      : null,
  };
}

export function getActiveMajorEvents(
  company: FictionalCompany,
  date: Date | string = new Date(),
  companies: FictionalCompany[] = [company],
) {
  const currentDate = marketDateKey(date);
  const state = ensureCycleSimulatedThrough(currentDate);
  const internalEvent = state?.activeEvent;
  if (!internalEvent) return [];
  const definition = definitionsById.get(internalEvent.definitionId);
  if (!definition) return [];
  const targetTicker = eventTargetTicker(internalEvent, companies);
  const event = buildActiveEvent(definition, internalEvent, currentDate, company, targetTicker);
  return event ? [event] : [];
}

export function getMajorEventImpact(
  company: FictionalCompany,
  date: Date | string = new Date(),
  companies: FictionalCompany[] = [company],
): MajorEventImpact {
  const activeEvents = getActiveMajorEvents(company, date, companies);
  const primaryEvent = activeEvents[0] ?? null;
  return {
    impactPct: primaryEvent?.currentImpactPct ?? 0,
    cumulativeImpactPct: primaryEvent?.cumulativeImpactPct ?? 0,
    volatilityBoost: primaryEvent?.volatilityBoost ?? 0,
    volumeMultiplier: primaryEvent?.volumeMultiplier ?? 1,
    activeEvents,
    primaryEvent,
  };
}

export function getActiveMajorMarketEvents(
  companies: FictionalCompany[],
  date: Date | string = new Date(),
): MarketMajorEventSummary[] {
  const summaries = new Map<string, MarketMajorEventSummary>();

  for (const company of companies) {
    for (const event of getActiveMajorEvents(company, date, companies)) {
      const existing = summaries.get(event.eventKey);
      if (existing) {
        existing.affectedCompanies += 1;
        if (!existing.affectedSectors.includes(company.sector)) existing.affectedSectors.push(company.sector);
        if (Math.abs(event.currentImpactPct) > Math.abs(existing.largestMovePct)) {
          existing.largestMovePct = event.currentImpactPct;
        }
        if (Math.abs(event.cumulativeImpactPct) > Math.abs(existing.largestCumulativeImpactPct)) {
          existing.largestCumulativeImpactPct = event.cumulativeImpactPct;
        }
        continue;
      }

      summaries.set(event.eventKey, {
        eventKey: event.eventKey,
        category: event.category,
        title: event.title,
        headline: event.headline,
        scope: event.scope,
        startDate: event.startDate,
        endDate: event.endDate,
        durationDays: event.durationDays,
        dayNumber: event.dayNumber,
        daysRemaining: event.daysRemaining,
        targetTicker: event.targetTicker,
        triggerProbabilityPct: event.triggerProbabilityPct,
        affectedCompanies: 1,
        affectedSectors: [company.sector],
        largestMovePct: event.currentImpactPct,
        largestCumulativeImpactPct: event.cumulativeImpactPct,
        cumulativeImpactCapPct: event.cumulativeImpactCapPct,
      });
    }
  }

  return [...summaries.values()];
}

export const majorEventCatalogStats = {
  total: config.events.length,
  world: worldEvents.length,
  company: companyEvents.length,
  categories: new Set(config.events.map((event) => event.category)).size,
  dailyProbabilityIncrementPct: config.cycle.dailyProbabilityIncrementPct,
  minDurationDays: config.cycle.minDurationDays,
  maxDurationDays: config.cycle.maxDurationDays,
  cumulativeImpactCapPct: config.cycle.cumulativeImpactCapPct,
};
