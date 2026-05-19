import { Suspense } from 'react';
import type { DealFilters, PaginatedResponse } from './types';
import { getApiUrl } from '@/lib/config';
import { getStores } from './api/stores';
import DealsPage from './DealsPage';

async function getInitialDeals(filters: DealFilters): Promise<PaginatedResponse | null> {
  try {
    const params = new URLSearchParams();
    params.set('limit', '16');
    if (filters.search) params.set('search', filters.search);
    filters.stores.forEach((s) => params.append('stores', s));

    const isFiltered = !!filters.search || filters.stores.length > 0;

    const [dealsData, stores] = await Promise.all([
      fetch(getApiUrl(`/api/deals?${params}`), {
        // Filtered responses are user-specific — don't cache at CDN level
        // Unfiltered default page caches for 1 minute
        ...(isFiltered
          ? { cache: 'no-store' }
          : { next: { revalidate: 60 } }),
      }).then((r) => (r.ok ? (r.json() as Promise<PaginatedResponse>) : null)),
      getStores(),
    ]);

    if (!dealsData) return null;
    return { ...dealsData, availableStores: stores };
  } catch (error) {
    console.error('Failed to fetch initial deals:', error);
    return null;
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stores?: string | string[] }>;
}) {
  const params = await searchParams;

  const filters: DealFilters = {
    search: typeof params.search === 'string' ? params.search : '',
    stores: Array.isArray(params.stores)
      ? params.stores
      : typeof params.stores === 'string'
        ? [params.stores]
        : [],
  };

  const initialData = await getInitialDeals(filters);

  return (
    <Suspense>
      <DealsPage initialData={initialData} />
    </Suspense>
  );
}
