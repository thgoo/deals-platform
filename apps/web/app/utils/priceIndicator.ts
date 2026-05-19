import type { PriceHistoryStats } from '../types';

// ─── Domain constants ──────────────────────────────────────────────────────

export const PRICE_LEVEL = {
  HISTORICAL_MIN: 'historical_min',
  GREAT: 'great',
  GOOD: 'good',
  AVERAGE: 'average',
  ABOVE: 'above',
  HIGH: 'high',
} as const;

export type PriceLevel = (typeof PRICE_LEVEL)[keyof typeof PRICE_LEVEL];

// ─── Thresholds ────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Price within 1% of all-time minimum → historical minimum
  HISTORICAL_MIN_TOLERANCE: 0.01,
  // Minimum sample size to call something "mínimo histórico"
  // With fewer data points the min is too unreliable to be meaningful
  HISTORICAL_MIN_SAMPLE: 5,
  // % deviation from average price
  GREAT: -0.2, // ≤ 20% below avg
  GOOD: -0.05, // ≤  5% below avg
  AVERAGE: 0.05, // within ±5% of avg
  ABOVE: 0.2, // ≤ 20% above avg
  // > 20% above avg → high
} as const;

// ─── Level metadata ────────────────────────────────────────────────────────

const LEVEL_META = {
  [PRICE_LEVEL.HISTORICAL_MIN]: {
    label: 'Mínimo histórico!',
    trend: 'down' as const,
  },
  [PRICE_LEVEL.GREAT]: {
    label: 'Muito abaixo da média!',
    trend: 'down' as const,
  },
  [PRICE_LEVEL.GOOD]: { label: 'Abaixo da média', trend: 'down' as const },
  [PRICE_LEVEL.AVERAGE]: { label: 'Preço na média', trend: null },
  [PRICE_LEVEL.ABOVE]: { label: 'Acima da média', trend: 'up' as const },
  [PRICE_LEVEL.HIGH]: { label: 'Muito acima da média', trend: 'up' as const },
} as const satisfies Record<
  PriceLevel,
  { label: string; trend: 'down' | 'up' | null }
>;

// ─── Derived types ─────────────────────────────────────────────────────────

export type PriceLabel = (typeof LEVEL_META)[PriceLevel]['label'];
export type PriceTrend = (typeof LEVEL_META)[PriceLevel]['trend'];

export type PriceIndicatorResult = {
  level: PriceLevel;
  label: PriceLabel;
  trend: PriceTrend;
  /** Normalized 0–1 position within the observed min–max range */
  position: number;
};

// ─── Internal helpers ──────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function resolveLevel(
  priceInCents: number,
  minPrice: number,
  avgPrice: number,
  totalDeals: number,
): PriceLevel {
  const pctAboveMin = (priceInCents - minPrice) / minPrice;
  if (
    pctAboveMin <= THRESHOLDS.HISTORICAL_MIN_TOLERANCE &&
    totalDeals >= THRESHOLDS.HISTORICAL_MIN_SAMPLE
  ) {
    return PRICE_LEVEL.HISTORICAL_MIN;
  }

  const pctFromAvg = (priceInCents - avgPrice) / avgPrice;
  if (pctFromAvg <= THRESHOLDS.GREAT) return PRICE_LEVEL.GREAT;
  if (pctFromAvg <= THRESHOLDS.GOOD) return PRICE_LEVEL.GOOD;
  if (pctFromAvg <= THRESHOLDS.AVERAGE) return PRICE_LEVEL.AVERAGE;
  if (pctFromAvg <= THRESHOLDS.ABOVE) return PRICE_LEVEL.ABOVE;
  return PRICE_LEVEL.HIGH;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getPriceIndicator(
  priceInCents: number,
  stats: PriceHistoryStats,
): PriceIndicatorResult | null {
  const { minPrice, maxPrice, avgPrice } = stats;

  if (!Number.isFinite(priceInCents)) return null;
  if (
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    !Number.isFinite(avgPrice)
  )
    return null;
  if (minPrice <= 0 || maxPrice <= 0 || avgPrice <= 0) return null;

  const range = maxPrice - minPrice;
  const position =
    range > 0 ? clamp((priceInCents - minPrice) / range, 0, 1) : 0.5;
  const level = resolveLevel(
    priceInCents,
    minPrice,
    avgPrice,
    stats.totalDeals,
  );

  return {
    level,
    label: LEVEL_META[level].label,
    trend: LEVEL_META[level].trend,
    position,
  };
}
