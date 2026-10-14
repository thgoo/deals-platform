'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import type { SWRInfiniteKeyedMutator } from 'swr/infinite';
import type { DealFilters, DealDto, DealsPageDto } from '../types';
import { getApiUrl } from '@/lib/config';

interface UsePaginatedDealsProps {
  filters: DealFilters;
  initialData?: DealsPageDto | null;
}

export interface UsePaginatedDealsReturn {
  items: DealDto[];
  hasMore: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  mutate: SWRInfiniteKeyedMutator<DealsPageDto[]>;
  loadMore: () => void;
}

const fetcher = (url: string): Promise<DealsPageDto> =>
  fetch(url).then((r) => r.json());

export function usePaginatedDeals({
  filters,
  initialData,
}: UsePaginatedDealsProps): UsePaginatedDealsReturn {
  const { search, stores } = filters;

  const buildQueryParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      params.set('limit', '16');
      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);
      if (stores.length > 0) params.set('stores', stores.join(','));
      return params.toString();
    },
    [search, stores],
  );

  const getKey = (pageIndex: number, previousPageData: DealsPageDto | null) => {
    if (previousPageData && !previousPageData.hasMore) return null;
    if (pageIndex === 0) return getApiUrl(`/api/deals?${buildQueryParams()}`);
    return getApiUrl(
      `/api/deals?${buildQueryParams(previousPageData?.nextCursor ?? undefined)}`,
    );
  };

  const { data, size, setSize, isLoading, mutate } =
    useSWRInfinite<DealsPageDto>(getKey, fetcher, {
      revalidateFirstPage: true,
      revalidateOnFocus: true,
      revalidateOnMount: true,
      fallbackData: initialData ? [initialData] : undefined,
      keepPreviousData: true,
      dedupingInterval: 2000,
    });

  // Reset to page 1 when filters change. The effect fires after the new key is
  // already active, so setSize(1) never triggers a re-fetch of the old key.
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    if (prevFiltersRef.current === filters) return;
    prevFiltersRef.current = filters;
    setSize(1);
  }, [filters, setSize]);

  const items = useMemo(
    () => data?.flatMap((page) => page.items) ?? [],
    [data],
  );
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? true) : true;
  const isLoadingMore =
    isLoading ||
    (size > 0 && data !== undefined && typeof data[size - 1] === 'undefined');
  const isInitialLoading = !data && isLoading;

  const loadMore = useCallback(() => setSize((s) => s + 1), [setSize]);

  return {
    items,
    hasMore: Boolean(hasMore),
    isLoadingMore: Boolean(isLoadingMore),
    isInitialLoading: Boolean(isInitialLoading),
    mutate,
    loadMore,
  };
}
