export const SENTIMENT_KEYS = ["positive", "neutral", "negative", "unknown"] as const;
export type SentimentKey = typeof SENTIMENT_KEYS[number];
export type SentimentValues = Record<SentimentKey, number>;
export type SentimentBreakdown = Partial<SentimentValues> & { counts?: Partial<SentimentValues> };

/** Allocate rounded percentages without hiding unknowns or exceeding 100%. */
export function sentimentPercentages(weights: Partial<SentimentValues>): SentimentValues {
  const values = SENTIMENT_KEYS.map(key => typeof weights[key] === "number" && Number.isFinite(weights[key]) && weights[key]! > 0 ? weights[key]! : 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return { positive: 0, neutral: 0, negative: 0, unknown: 0 };
  const exact = values.map(value => value / total * 100);
  const whole = exact.map(Math.floor);
  const ranked = whole.map((_, index) => index).sort((a, b) => (exact[b] - whole[b]) - (exact[a] - whole[a]));
  for (const index of ranked.slice(0, 100 - whole.reduce((sum, value) => sum + value, 0))) whole[index]++;
  return Object.fromEntries(SENTIMENT_KEYS.map((key, index) => [key, whole[index]])) as SentimentValues;
}

export function sentimentDistribution(breakdown: SentimentBreakdown, newsCount: number) {
  const total = Number.isSafeInteger(newsCount) && newsCount > 0 ? newsCount : 0;
  const counts = breakdown.counts;
  const reliable = counts && SENTIMENT_KEYS.every(key => Number.isSafeInteger(counts[key]) && counts[key]! >= 0)
    && SENTIMENT_KEYS.reduce((sum, key) => sum + counts[key]!, 0) === total;
  if (reliable) return { total, counts: counts as SentimentValues, percentages: sentimentPercentages(counts) };
  const weights = Object.fromEntries(SENTIMENT_KEYS.map(key => [key, Number.isFinite(breakdown[key]) && breakdown[key]! > 0 ? breakdown[key] : 0])) as SentimentValues;
  if (breakdown.unknown == null) weights.unknown = Math.max(0, 100 - weights.positive - weights.neutral - weights.negative);
  if (total && !SENTIMENT_KEYS.some(key => weights[key] > 0)) weights.unknown = 100;
  return { total, counts: null, percentages: sentimentPercentages(total ? weights : {}) };
}
