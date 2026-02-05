import type { PriceHistoryStats } from '../types';

export type PriceIndicatorTrend = 'down' | 'up' | null;

export type PriceIndicatorLevel =
  | 'great'
  | 'good'
  | 'average'
  | 'above'
  | 'high';

export type PriceIndicatorResult = {
  level: PriceIndicatorLevel;
  label:
    | 'Ótimo preço!'
    | 'Bom preço'
    | 'Preço na média'
    | 'Acima da média'
    | 'Preço alto';
  trend: PriceIndicatorTrend;
  position: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function getPriceIndicator(
  priceInCents: number,
  stats: PriceHistoryStats,
): PriceIndicatorResult | null {
  const min = stats.minPrice;
  const max = stats.maxPrice;

  if (!Number.isFinite(priceInCents)) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min <= 0 || max <= 0) return null;

  const range = max - min;
  if (range <= 0) {
    return {
      level: 'average',
      label: 'Preço na média',
      trend: null,
      position: 0.5,
    };
  }

  const position = clamp((priceInCents - min) / range, 0, 1);
  const pctAboveMin = (priceInCents - min) / min;
  const pctBelowMax = (max - priceInCents) / max;

  if (pctAboveMin <= 0.02) {
    return {
      level: 'great',
      label: 'Ótimo preço!',
      trend: 'down',
      position,
    };
  }

  if (pctBelowMax <= 0.02) {
    return {
      level: 'high',
      label: 'Preço alto',
      trend: 'up',
      position,
    };
  }

  if (position <= 0.15) {
    return {
      level: 'great',
      label: 'Ótimo preço!',
      trend: 'down',
      position,
    };
  }

  if (position <= 0.4) {
    return {
      level: 'good',
      label: 'Bom preço',
      trend: 'down',
      position,
    };
  }

  if (position <= 0.6) {
    return {
      level: 'average',
      label: 'Preço na média',
      trend: null,
      position,
    };
  }

  if (position <= 0.85) {
    return {
      level: 'above',
      label: 'Acima da média',
      trend: 'up',
      position,
    };
  }

  return {
    level: 'high',
    label: 'Preço alto',
    trend: 'up',
    position,
  };
}
