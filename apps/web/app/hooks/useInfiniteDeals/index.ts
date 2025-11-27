'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { mutate as globalMutate } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { getApiUrl } from '@/lib/config';
import { PaginatedResponse } from '../../types';
import { matchesDealFilters } from '../../utils/filters/dealFilters';
import { useDealEvents } from '../useDealEvents';
import {
  UseInfiniteDealsProps,
  UseInfiniteDealsReturn,
  FilterCriteria,
} from './types';

const fetcher = (url: string): Promise<PaginatedResponse> =>
  fetch(url).then((r) => r.json());

/**
 * Hook for fetching and managing infinite-loading deals with filtering and real-time updates
 */
export default function useInfiniteDeals({
  initialData,
  search = '',
  hasCoupon = null,
  stores = [],
}: UseInfiniteDealsProps = {}): UseInfiniteDealsReturn {
  // Using RefObject<HTMLDivElement> to match the return type
  const observerTarget = useRef<HTMLDivElement>(null);

  // Memoize filter criteria for consistent reference across renders
  const filterCriteria = useMemo<FilterCriteria>(
    () => ({
      search,
      hasCoupon,
      stores,
    }),
    [search, hasCoupon, stores],
  );

  // Build query params with memoization
  const buildQueryParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      params.set('limit', '16');

      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);
      if (hasCoupon !== null) params.set('hasCoupon', String(hasCoupon));
      if (stores.length > 0) params.set('stores', stores.join(','));

      return params.toString();
    },
    [search, hasCoupon, stores],
  );

  // SWR Infinite for pagination
  const getKey = (
    pageIndex: number,
    previousPageData: PaginatedResponse | null,
  ) => {
    if (previousPageData && !previousPageData.hasMore) return null;

    if (pageIndex === 0) {
      return getApiUrl(`/api/deals?${buildQueryParams()}`);
    }

    return getApiUrl(
      `/api/deals?${buildQueryParams(previousPageData?.nextCursor || undefined)}`,
    );
  };

  // Previous filter state to detect changes
  const prevFiltersRef = useRef({
    search,
    hasCoupon,
    stores: [...(stores || [])],
  });

  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<PaginatedResponse>(getKey, fetcher, {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnMount: true,
      fallbackData:
        initialData && !search && hasCoupon === null && stores.length === 0
          ? [initialData]
          : undefined,
      keepPreviousData: true, // Keep data during transitions
      dedupingInterval: 5000, // Reduce duplicate requests during filter changes
    });

  // Reset to first page when filters change
  useEffect(() => {
    const prevFilters = prevFiltersRef.current;
    const filtersChanged =
      prevFilters.search !== search ||
      prevFilters.hasCoupon !== hasCoupon ||
      prevFilters.stores.length !== stores.length ||
      (stores.length > 0 &&
        prevFilters.stores.some((s) => !stores.includes(s))) ||
      (prevFilters.stores.length > 0 &&
        stores.some((s) => !prevFilters.stores.includes(s)));

    if (filtersChanged && size > 1) {
      // Reset to first page when filters change
      setSize(1);
    }

    // Update the previous filters reference
    prevFiltersRef.current = { search, hasCoupon, stores: [...(stores || [])] };
  }, [search, hasCoupon, stores, size, setSize]);

  // Flatten all pages into single items array
  const items = data ? data.flatMap((page) => page.items) : [];
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? true) : true;
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === 'undefined');
  // Consider only initial loading when there's no data in any page
  const isInitialLoading = !data && isLoading;

  // SSE - Real-time new deals (persistent connection)
  const dealEvents = useDealEvents();

  // Handle new deal events with proper error handling
  useEffect(() => {
    // Track active timeouts for cleanup
    const timeoutIds: NodeJS.Timeout[] = [];

    const handleNewDeal = (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('Received empty new-deal event data');
          return;
        }

        const newDeal = JSON.parse(event.data);

        // Validate required deal fields
        if (!newDeal || !newDeal.id) {
          console.warn('Received invalid deal data:', newDeal);
          return;
        }

        // Check if the new deal matches the current filters
        const matchesFilters = matchesDealFilters(newDeal, filterCriteria);

        // If it doesn't match filters, don't add it
        if (!matchesFilters) {
          return;
        }

        mutate(
          (pages) => {
            if (!pages || pages.length === 0) {
              const firstPage = initialData || {
                items: [],
                hasMore: true,
                nextCursor: null,
              };
              return [
                {
                  ...firstPage,
                  items: [newDeal, ...firstPage.items],
                },
              ];
            }

            // Check if the deal already exists in the first page to avoid duplicates
            const firstPageItems = pages[0].items;
            const dealExists = firstPageItems.some(
              (item) => item.id === newDeal.id,
            );

            if (dealExists) {
              return pages; // Don't add duplicates
            }

            const newPages = [...pages];
            newPages[0] = {
              ...newPages[0],
              items: [newDeal, ...newPages[0].items],
            };
            return newPages;
          },
          { revalidate: false }, // Don't revalidate immediately
        );

        // Schedule a cache revalidation after a delay
        // This ensures data stays in sync with the server
        const timeoutId = setTimeout(() => {
          // Only invalidate the first page
          const firstPageKey = getApiUrl(`/api/deals?${buildQueryParams()}`);
          globalMutate(firstPageKey);
        }, 10000); // 10 seconds delay to avoid overloading

        timeoutIds.push(timeoutId);
      } catch (error) {
        console.error('❌ Error processing new-deal event:', error);
      }
    };

    // Register event listeners
    dealEvents.addEventListener('new-deal', handleNewDeal);

    return () => {
      // Clean up event listeners
      dealEvents.removeEventListener('new-deal', handleNewDeal);

      // Clear any pending timeouts
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [mutate, filterCriteria, initialData, buildQueryParams, dealEvents]);

  // Handle image update events with improved error handling
  useEffect(() => {
    const handleImageUpdate = (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('Received empty image-updated event data');
          return;
        }

        const data = JSON.parse(event.data);
        const { id, localPath } = data;

        // Validate required fields
        if (!id || !localPath) {
          console.warn('Received invalid image update data:', data);
          return;
        }

        mutate(
          (pages) => {
            if (!pages || pages.length === 0) return pages;

            // Check if any items would actually be updated
            let hasMatchingItem = false;
            for (const page of pages) {
              if (page.items.some((item) => item.id === id)) {
                hasMatchingItem = true;
                break;
              }
            }

            // If no matching items, don't update state
            if (!hasMatchingItem) return pages;

            const newPages = pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === id ? { ...item, localPath } : item,
              ),
            }));

            return newPages;
          },
          { revalidate: false }, // Don't revalidate
        );
      } catch (error) {
        console.error('❌ Error processing image-updated event:', error);
      }
    };

    // Register event listener
    dealEvents.addEventListener('image-updated', handleImageUpdate);

    return () => {
      // Clean up event listener
      dealEvents.removeEventListener('image-updated', handleImageUpdate);
    };
  }, [mutate, dealEvents]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setSize(size + 1);
        }
      },
      { threshold: 0.1 },
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, size, setSize]);

  const isFilteringInProgress: boolean = Boolean(
    isValidating && data && data.length > 0 && !initialData,
  );

  return {
    items,
    hasMore: Boolean(hasMore),
    isLoadingMore: Boolean(isLoadingMore),
    isInitialLoading: Boolean(isInitialLoading),
    isValidating: Boolean(isValidating),
    isFilteringInProgress,
    observerTarget,
  };
}
