'use client';

import { useEffect, useRef, useState } from 'react';
import type { PriceHistoryResponse } from '../../types';
import { getApiUrl } from '@/lib/config';

type CacheEntry = {
  data: PriceHistoryResponse | null;
  notFound: boolean;
  ts: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();

async function fetchPriceHistory(productKey: string): Promise<CacheEntry> {
  const existing = inFlight.get(productKey);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(
      getApiUrl(`/api/deals/price-history/${encodeURIComponent(productKey)}`),
    );
    if (res.status === 404) {
      return { data: null, notFound: true, ts: Date.now() };
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch price history (${res.status})`);
    }

    return {
      data: (await res.json()) as PriceHistoryResponse,
      notFound: false,
      ts: Date.now(),
    };
  })();

  inFlight.set(productKey, promise);

  try {
    return await promise;
  } finally {
    inFlight.delete(productKey);
  }
}

export function usePriceHistory(
  productKey?: string | null,
  options?: {
    enabled?: boolean;
    staleTimeMs?: number;
  },
) {
  const enabled = options?.enabled ?? true;
  const staleTimeMs = options?.staleTimeMs ?? 5 * 60 * 1000;

  const [data, setData] = useState<PriceHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [notFound, setNotFound] = useState(false);

  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !productKey) {
      setIsLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    if (lastKeyRef.current !== productKey) {
      lastKeyRef.current = productKey;
      setData(null);
      setError(null);
      setNotFound(false);
    }

    const cached = cache.get(productKey);
    const isFresh = cached && Date.now() - cached.ts < staleTimeMs;

    if (isFresh) {
      setData(cached.data);
      setNotFound(cached.notFound);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchPriceHistory(productKey);
        if (cancelled) return;
        cache.set(productKey, result);
        setData(result.data);
        setNotFound(result.notFound);
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
        setData(null);
        setNotFound(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, productKey, staleTimeMs]);

  return { data, isLoading, error, notFound };
}
