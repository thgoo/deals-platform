'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatRelativeTime } from './format';

interface RefreshTickerProps {
  /** ISO timestamp from the server — when this render was produced. */
  renderedAt: string;
  /** Polling backstop interval (ms). Defaults to 60s. */
  refreshIntervalMs?: number;
  /** Public backend URL used for the SSE connection. */
  sseUrl: string;
}

const REFRESH_DEBOUNCE_MS = 2000;

/**
 * Three responsibilities in one client component:
 *
 *   1. Tick the "refreshed Xs ago" label every second so it stays honest.
 *      No fetch — just recomputes the relative time from `renderedAt`.
 *
 *   2. Listen to /api/deals/stream (SSE) and trigger router.refresh() when
 *      a new-deal event arrives. This is the "real-time" path — instant
 *      updates whenever a deal lands. Debounced 2s to group bursts.
 *
 *   3. Polling backstop (default 60s) for cases SSE doesn't cover:
 *      backfill resolutions (no SSE event), silent SSE drops, etc.
 *
 * When the tab is hidden, polling pauses (visibility API). SSE stays open —
 * the browser handles backgrounded connections natively.
 */
export default function RefreshTicker({
  renderedAt,
  refreshIntervalMs = 60_000,
  sseUrl,
}: RefreshTickerProps) {
  const router = useRouter();
  // Bumping `tick` forces a re-render so `formatRelativeTime(renderedAt)`
  // (which reads `Date.now()` internally) stays current. Cheaper than holding
  // the formatted string in state — and dodges the no-set-state-in-effect rule.
  const [, setTick] = useState(0);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Debounced refresh — both SSE bursts and polling go through here.
  const debouncedRefresh = useRef(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) return;
    lastRefreshRef.current = now;
    router.refresh();
  });
  // Keep the ref's closure pointing at the current `router` (it's stable but
  // best practice to refresh anyway since we declare router in deps elsewhere).
  useEffect(() => {
    debouncedRefresh.current = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    };
  }, [router]);

  // SSE — instant refresh when a new deal lands.
  useEffect(() => {
    if (!sseUrl) return;
    const es = new EventSource(sseUrl);
    const onNewDeal = () => debouncedRefresh.current();
    es.addEventListener('new-deal', onNewDeal);
    // image-updated lands ~seconds after new-deal; refresh too so the latest
    // decision row's product picture (if shown later) doesn't lag.
    es.addEventListener('image-updated', onNewDeal);
    return () => {
      es.removeEventListener('new-deal', onNewDeal);
      es.removeEventListener('image-updated', onNewDeal);
      es.close();
    };
  }, [sseUrl]);

  // Polling backstop — covers backfill / SSE silent failures.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => debouncedRefresh.current(), refreshIntervalMs);
    };

    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        debouncedRefresh.current(); // catch up immediately on focus
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshIntervalMs]);

  const label = formatRelativeTime(renderedAt);

  return (
    <span className="mono text-[10px] tracking-widest text-zinc-400 uppercase">
      refreshed {label}
    </span>
  );
}
