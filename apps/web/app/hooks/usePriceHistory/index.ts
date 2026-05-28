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

async function fetchPriceHistory(productId: string): Promise<CacheEntry> {
  const existing = inFlight.get(productId);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(
      getApiUrl(`/api/deals/price-history/${encodeURIComponent(productId)}`),
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

  inFlight.set(productId, promise);

  try {
    return await promise;
  } finally {
    inFlight.delete(productId);
  }
}

export function usePriceHistory(
  productId?: string | null,
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
    if (!enabled || !productId) {
      setIsLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    if (lastKeyRef.current !== productId) {
      lastKeyRef.current = productId;
      setData(null);
      setError(null);
      setNotFound(false);
    }

    const cached = cache.get(productId);
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
        const result = await fetchPriceHistory(productId);
        if (cancelled) return;
        cache.set(productId, result);
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
  }, [enabled, productId, staleTimeMs]);

  return { data, isLoading, error, notFound };
}
