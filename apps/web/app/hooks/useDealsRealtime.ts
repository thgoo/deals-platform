'use client';

import { useEffect, useRef } from 'react';
import type { SWRInfiniteKeyedMutator } from 'swr/infinite';
import { getApiUrl } from '@/lib/config';
import type { DealFilters, Item, PaginatedResponse } from '../types';
import { matchesDealFilters } from '../utils/filters/dealFilters';
import { useEventSource } from './useEventSource';

interface UseDealsRealtimeProps {
  filters: DealFilters;
  mutate: SWRInfiniteKeyedMutator<PaginatedResponse[]>;
}

export function useDealsRealtime({ filters, mutate }: UseDealsRealtimeProps) {
  const { addEventListener, removeEventListener } = useEventSource({
    url: getApiUrl('/api/deals/stream'),
  });

  // Always-current ref so handlers never capture stale filter values
  // without needing to re-register on every filter change
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });

  useEffect(() => {
    const handleNewDeal = (event: MessageEvent) => {
      try {
        const newDeal: Item = JSON.parse(event.data);
        if (!newDeal?.id) return;
        if (!matchesDealFilters(newDeal, filtersRef.current)) return;

        mutate(
          (pages) => {
            if (!pages?.length) return pages;
            if (pages[0].items.some((item) => item.id === newDeal.id))
              return pages;
            const next = [...pages];
            next[0] = { ...next[0], items: [newDeal, ...next[0].items] };
            return next;
          },
          { revalidate: false },
        );
      } catch {
        // ignore malformed SSE payloads
      }
    };

    const handleImageUpdate = (event: MessageEvent) => {
      try {
        const { id, localPath } = JSON.parse(event.data) as {
          id: number;
          localPath: string;
        };
        if (!id || !localPath) return;

        mutate(
          (pages) => {
            if (!pages?.length) return pages;
            const hasItem = pages.some((page) =>
              page.items.some((item) => item.id === id),
            );
            if (!hasItem) return pages;
            return pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === id ? { ...item, localPath } : item,
              ),
            }));
          },
          { revalidate: false },
        );
      } catch {
        // ignore malformed SSE payloads
      }
    };

    addEventListener('new-deal', handleNewDeal);
    addEventListener('image-updated', handleImageUpdate);

    return () => {
      removeEventListener('new-deal', handleNewDeal);
      removeEventListener('image-updated', handleImageUpdate);
    };
  }, [mutate, addEventListener, removeEventListener]);
}
