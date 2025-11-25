import { getApiUrl } from '@/lib/config';

export interface StoresResponse {
  stores: string[];
}

export async function getStores(): Promise<string[]> {
  try {
    const res = await fetch(getApiUrl('/api/deals/stores'), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!res.ok) {
      console.error('Failed to fetch stores:', res.statusText);
      return [];
    }

    const data: StoresResponse = await res.json();
    return data.stores;
  } catch (error) {
    console.error('Error fetching stores:', error);
    return [];
  }
}
