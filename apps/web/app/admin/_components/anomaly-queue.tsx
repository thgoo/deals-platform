'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Anomaly } from '../_lib/types';
import { refreshDashboardCaches } from '../_actions/cleanup';
import { formatBRL, formatNumber } from './format';
import ReviewModal from './review-modal';

interface AnomalyQueueProps {
  anomalies: Anomaly[];
}

/**
 * Cleanup queue: products whose price band (p90/p10) is too wide to be a single
 * product — garbage-magnet matches from the bootstrap period, variant collapse,
 * etc. Clicking "Review" opens a terminal-style modal that shows each deal's
 * verdict and lets the operator unlink the wrong ones.
 */
export default function AnomalyQueue({ anomalies }: AnomalyQueueProps) {
  const router = useRouter();
  const [active, setActive] = useState<Anomaly | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  // Invalidate the backend caches, then re-fetch the server component. Wrapped
  // in a transition so it never blocks interaction — the indicator just shows
  // the queue is catching up after edits made in the modal.
  const refresh = () => {
    startTransition(async () => {
      await refreshDashboardCaches();
      router.refresh();
    });
  };

  if (anomalies.length === 0) {
    return (
      <div className="text-xs text-zinc-400">
        no anomalies — catalog looks clean
      </div>
    );
  }

  return (
    <>
      {isRefreshing && (
        <div className="mb-2 flex items-center gap-2 text-[11px] tracking-wider text-cyan-700 uppercase">
          <span className="animate-spin">↻</span> updating dashboard…
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left tracking-wider text-zinc-400 uppercase">
            <tr className="border-b border-zinc-200">
              <th className="py-2 pr-4 font-medium">product</th>
              <th className="py-2 pr-4 font-medium">category</th>
              <th className="py-2 pr-4 text-right font-medium">deals</th>
              <th className="py-2 pr-4 text-right font-medium">floor · p10</th>
              <th className="py-2 pr-4 text-right font-medium">
                ceiling · p90
              </th>
              <th className="py-2 pr-4 text-right font-medium">spread</th>
              <th className="py-2 pr-0 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {anomalies.map((a) => (
              <tr
                key={a.productId}
                className="border-b border-zinc-100 last:border-0"
              >
                <td className="max-w-[28rem] truncate py-2 pr-4 text-zinc-800">
                  {a.canonicalName}
                </td>
                <td className="mono py-2 pr-4 text-[10px] tracking-wider text-zinc-500 uppercase">
                  {a.category ?? '—'}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-700 tabular-nums">
                  {formatNumber(a.deals)}
                </td>
                <td className="mono py-2 pr-4 text-right text-emerald-700 tabular-nums">
                  {formatBRL(a.p10)}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-500 tabular-nums">
                  {formatBRL(a.p90)}
                </td>
                <td className="mono py-2 pr-4 text-right tabular-nums">
                  <span style={{ color: '#b91c1c' }}>{a.spreadRatio}×</span>
                </td>
                <td className="py-2 pr-0 text-right">
                  <button
                    onClick={() => setActive(a)}
                    className="border border-zinc-300 px-2.5 py-1 text-[11px] tracking-wider text-zinc-700 uppercase hover:bg-zinc-100"
                  >
                    review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <ReviewModal
          productId={active.productId}
          canonicalName={active.canonicalName}
          onClose={() => setActive(null)}
          onCleaned={refresh}
        />
      )}
    </>
  );
}
