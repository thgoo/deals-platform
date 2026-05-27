/**
 * Stale-while-revalidate (SWR) in-process cache for dashboard service methods.
 *
 * Behavior:
 *   - Fresh hit: return the cached value immediately.
 *   - Stale hit: return the OLD cached value immediately, kick off a background
 *     recompute. Subsequent stale hits during recompute also return the old
 *     value. The cache only blocks the FIRST cold request — every subsequent
 *     call is instant, even when the data is stale.
 *   - Cold start: no cached value, block once until compute() resolves, then
 *     coalesce concurrent waiters on the same in-flight promise.
 *
 * This eliminates the long-tail latency that plagued the duplicate-suspects
 * scan (O(N²) over ~thousands of products): once warmed at boot, subsequent
 * refreshes are instant even past the TTL.
 *
 * Single-slot cache (one value per instance). Sufficient because each dashboard
 * service method is called with fixed parameters by the dashboard page.
 */
export interface TtlCache<T> {
  get(compute: () => Promise<T>): Promise<T>;
  /** Eagerly warm the cache. Returns a promise that resolves when ready. */
  warm(compute: () => Promise<T>): Promise<T>;
  /** Clear the cached value — next `get` triggers a fresh compute and blocks. */
  invalidate(): void;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  function startRecompute(compute: () => Promise<T>): Promise<T> {
    pending = compute()
      .then(value => {
        cached = { value, expiresAt: Date.now() + ttlMs };
        pending = null;
        return value;
      })
      .catch(err => {
        // Don't poison the cache on failure — let the next call retry.
        pending = null;
        throw err;
      });
    return pending;
  }

  return {
    async get(compute) {
      const now = Date.now();

      // Fresh hit.
      if (cached && now < cached.expiresAt) {
        return cached.value;
      }

      // Stale hit with revalidation already in flight → return stale immediately.
      if (cached && pending) {
        return cached.value;
      }

      // Stale hit, no revalidation in flight → start one, return stale.
      // The background refresh updates the cache for future calls. Errors are
      // swallowed (catch on `pending` already prevents unhandled rejection).
      if (cached) {
        startRecompute(compute).catch(() => undefined);
        return cached.value;
      }

      // Cold start. Block until ready; coalesce concurrent waiters.
      if (pending) return pending;
      return startRecompute(compute);
    },

    async warm(compute) {
      // Same as get() on a cold cache — but called explicitly at boot so the
      // first HTTP request finds the cache already populated.
      if (cached) return cached.value;
      if (pending) return pending;
      return startRecompute(compute);
    },

    invalidate() {
      cached = null;
    },
  };
}
