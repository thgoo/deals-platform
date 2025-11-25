'use client';
import { useEffect, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import { getApiUrl } from '@/lib/config';
import { PaginatedResponse } from '../types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UseInfiniteDealsProps {
  initialData?: PaginatedResponse | null;
}

export default function useInfiniteDeals({
  initialData,
}: UseInfiniteDealsProps = {}) {
  const observerTarget = useRef<HTMLDivElement>(null);

  // SWR Infinite for pagination
  const getKey = (
    pageIndex: number,
    previousPageData: PaginatedResponse | null,
  ) => {
    // Reached the end
    if (previousPageData && !previousPageData.hasMore) return null;

    // First page
    if (pageIndex === 0) return getApiUrl('/api/deals?limit=16');

    // Next pages with cursor
    return getApiUrl(
      `/api/deals?limit=16&cursor=${previousPageData?.nextCursor}`,
    );
  };

  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<PaginatedResponse>(getKey, fetcher, {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnMount: false,
      fallbackData: initialData ? [initialData] : undefined,
      keepPreviousData: true, // Keep previous data while loading
    });

  // Flatten all pages into single items array
  const items = data ? data.flatMap((page) => page.items) : [];
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? true) : true;
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === 'undefined');
  const isInitialLoading = !data && isLoading;

  // SSE - Real-time new deals
  useEffect(() => {
    const url = getApiUrl('/api/deals/stream');
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000; // 30s max
    const baseDelay = 1000; // 1s base

    const connect = () => {
      console.log('Attempting SSE connection to:', url);
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log('✅ SSE connected successfully');
        reconnectAttempts = 0; // Reset on successful connection
      };

      eventSource.addEventListener('new-deal', (event) => {
        console.log('🆕 SSE: new-deal event received');
        try {
          const newDeal = JSON.parse(event.data);
          console.log('🆕 New deal data:', newDeal);

          // Insert new deal at the top with animation flag
          mutate(
            (pages) => {
              console.log('🔄 Mutating pages, current pages:', pages?.length);

              // If no pages yet, use initial data or create first page
              if (!pages || pages.length === 0) {
                console.log(
                  '⚠️ No pages yet, creating first page with new deal',
                );
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

              const newPages = [...pages];
              const oldItemsCount = newPages[0].items.length;
              newPages[0] = {
                ...newPages[0],
                items: [newDeal, ...newPages[0].items],
              };
              console.log(
                `✅ Added new deal. Items: ${oldItemsCount} → ${newPages[0].items.length}`,
              );
              return newPages;
            },
            { revalidate: false }, // Don't revalidate
          );
        } catch (error) {
          console.error('❌ Error processing new-deal event:', error);
        }
      });

      eventSource.addEventListener('image-updated', (event) => {
        const { id, localPath } = JSON.parse(event.data);

        // Update existing deal with image
        mutate(
          (pages) => {
            if (!pages || pages.length === 0) return pages;

            // Map through all pages and update the matching deal
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
      });

      eventSource.onerror = () => {
        if (eventSource?.readyState === 2) {
          // CLOSED
          console.error('❌ SSE connection closed, reconnecting...');
          eventSource.close();

          // Exponential backoff with max delay
          const delay = Math.min(
            baseDelay * Math.pow(2, reconnectAttempts),
            maxReconnectDelay,
          );
          reconnectAttempts++;

          console.log(
            `🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`,
          );
          reconnectTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      console.log('🔌 Closing SSE connection');
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [mutate]);

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

  return {
    items,
    hasMore,
    isLoadingMore,
    isInitialLoading,
    isValidating,
    observerTarget,
  };
}
