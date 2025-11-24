import type { PaginatedResponse } from './types';
import { getApiUrl } from '@/lib/config';
import LiveClient from './LiveClient';

async function getInitialDeals(): Promise<PaginatedResponse | null> {
  try {
    const res = await fetch(getApiUrl('/api/deals?limit=24'), {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Failed to fetch initial deals:', error);
    return null;
  }
}

export default async function Live() {
  const initialData = await getInitialDeals();
  return <LiveClient initialData={initialData} />;
}
