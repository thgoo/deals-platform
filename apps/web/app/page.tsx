import type { PaginatedResponse } from './types';
import { getApiUrl } from '@/lib/config';
import { getStores } from './api/stores';
import LiveClient from './LiveClient';

async function getInitialDeals(): Promise<PaginatedResponse | null> {
  try {
    // Fetch deals
    const res = await fetch(getApiUrl('/api/deals?limit=16'), {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    // Fetch stores
    const stores = await getStores();

    // Combine data
    const dealsData: PaginatedResponse = await res.json();
    return {
      ...dealsData,
      availableStores: stores,
    };
  } catch (error) {
    console.error('Failed to fetch initial deals:', error);
    return null;
  }
}

export default async function Home() {
  const initialData = await getInitialDeals();
  return <LiveClient initialData={initialData} />;
}
