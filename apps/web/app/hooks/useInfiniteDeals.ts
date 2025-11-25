'use client';
import { useEffect, useRef, useCallback } from 'react';
import { mutate as globalMutate } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { getApiUrl } from '@/lib/config';
import { PaginatedResponse } from '../types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UseInfiniteDealsProps {
  initialData?: PaginatedResponse | null;
  search?: string;
  hasCoupon?: boolean | null;
  stores?: string[];
}

export default function useInfiniteDeals({
  initialData,
  search = '',
  hasCoupon = null,
  stores = [],
}: UseInfiniteDealsProps = {}) {
  const observerTarget = useRef<HTMLDivElement>(null);

  // Build query params - memoizado com useCallback
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

  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<PaginatedResponse>(getKey, fetcher, {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnMount: true,
      fallbackData:
        initialData && !search && hasCoupon === null && stores.length === 0
          ? [initialData]
          : undefined,
      keepPreviousData: true, // Manter dados durante transições
    });

  // Flatten all pages into single items array
  const items = data ? data.flatMap((page) => page.items) : [];
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? true) : true;
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === 'undefined');
  // Considerar apenas carregamento inicial quando não há dados em nenhuma página
  const isInitialLoading = !data && isLoading;

  // SSE - Real-time new deals (always active)
  useEffect(() => {
    // Always connect to SSE, even with filters active

    const url = getApiUrl('/api/deals/stream');
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000; // 30s max
    const baseDelay = 1000; // 1s base

    const connect = () => {
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
      };

      eventSource.addEventListener('new-deal', (event) => {
        try {
          const newDeal = JSON.parse(event.data);

          // Verificar se o novo deal corresponde aos filtros ativos
          let matchesFilters = true;

          // Verificar filtro de busca
          if (search) {
            const searchLower = search.toLowerCase();
            const textToSearch = [
              newDeal.product,
              newDeal.description,
              newDeal.text,
              newDeal.store,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            if (!textToSearch.includes(searchLower)) {
              matchesFilters = false;
            }
          }

          // Verificar filtro de cupom
          if (hasCoupon !== null) {
            const hasCoupons = newDeal.coupons && newDeal.coupons.length > 0;
            if ((hasCoupon && !hasCoupons) || (!hasCoupon && hasCoupons)) {
              matchesFilters = false;
            }
          }

          // Verificar filtro de lojas
          if (stores.length > 0 && newDeal.store) {
            if (!stores.includes(newDeal.store)) {
              matchesFilters = false;
            }
          }

          // Se não corresponde aos filtros, não adicionar
          if (!matchesFilters) {
            return;
          }

          // Adicionar o novo deal que corresponde aos filtros
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

              const newPages = [...pages];
              newPages[0] = {
                ...newPages[0],
                items: [newDeal, ...newPages[0].items],
              };
              return newPages;
            },
            { revalidate: false }, // Don't revalidate
          );

          // Programar uma revalidação do cache após um curto delay
          // Isso garante que os dados estejam sincronizados com o servidor
          setTimeout(() => {
            // Invalidar especificamente a primeira página
            const firstPageKey = getApiUrl(`/api/deals?${buildQueryParams()}`);
            globalMutate(firstPageKey);
          }, 10000); // 10 segundos de delay para não sobrecarregar
        } catch (error) {
          console.error('❌ Error processing new-deal event:', error);
        }
      });

      eventSource.addEventListener('image-updated', (event) => {
        const { id, localPath } = JSON.parse(event.data);
        mutate(
          (pages) => {
            if (!pages || pages.length === 0) return pages;
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
          eventSource.close();
          const delay = Math.min(
            baseDelay * Math.pow(2, reconnectAttempts),
            maxReconnectDelay,
          );
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [mutate, search, hasCoupon, stores, initialData, buildQueryParams]);

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

  const isFilteringInProgress =
    isValidating && data && data.length > 0 && !initialData;

  return {
    items,
    hasMore,
    isLoadingMore,
    isInitialLoading,
    isValidating,
    isFilteringInProgress,
    observerTarget,
  };
}
