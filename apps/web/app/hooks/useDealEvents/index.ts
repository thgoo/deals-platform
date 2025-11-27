import { getApiUrl } from '@/lib/config';
import { useEventSource } from '../useEventSource';

/**
 * Hook specifically for the deals SSE endpoint
 */
export function useDealEvents() {
  const url = getApiUrl('/api/deals/stream');
  return useEventSource({ url });
}
