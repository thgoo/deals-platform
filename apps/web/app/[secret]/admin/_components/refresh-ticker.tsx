'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from './format';

interface RefreshTickerProps {
  /** ISO timestamp from the server — when this render was produced. */
  renderedAt: string;
  /** Interval to re-fetch the page (ms). Defaults to 30s. */
  refreshIntervalMs?: number;
}

/**
 * Two responsibilities in one client component:
 *
 *   1. Tick the "refreshed Xs ago" label every second so it stays honest.
 *      No fetch — just recomputes the relative time from `renderedAt`.
 *
 *   2. Call `router.refresh()` on a schedule (default 30s). Next.js re-runs
 *      the server component and streams the new RSC payload — every widget
 *      on the dashboard updates without a hard reload.
 *
 * When the tab is hidden, the refresh interval pauses (visibility API) so we
 * don't burn quota / DB on a window the operator isn't looking at.
 */
export default function RefreshTicker({
  renderedAt,
  refreshIntervalMs = 30_000,
}: RefreshTickerProps) {
  const router = useRouter();
  // Bumping `tick` forces a re-render so `formatRelativeTime(renderedAt)`
  // (which reads `Date.now()` internally) stays current. Cheaper than holding
  // the formatted string in state — and dodges the no-set-state-in-effect rule.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = formatRelativeTime(renderedAt);

  // Auto-refresh: trigger router.refresh() periodically while the tab is visible.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => router.refresh(), refreshIntervalMs);
    };

    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh(); // catch up immediately on focus
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
  }, [router, refreshIntervalMs]);

  return (
    <span className="mono text-[10px] tracking-widest text-zinc-400 uppercase">
      refreshed {label}
    </span>
  );
}
