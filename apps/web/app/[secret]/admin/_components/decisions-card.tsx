'use client';

import { useMemo, useState } from 'react';
import type { RecentDecision } from '../_lib/types';
import DecisionsTable from './decisions-table';
import { methodColor, methodLabel } from './format';

interface DecisionsCardProps {
  decisions: RecentDecision[];
}

/**
 * Decisions table wrapped with:
 *   - method filter chips (client-side filter — no roundtrip)
 *   - fixed-height scrollable container so the page doesn't get dominated
 *     by an unbounded table when there are hundreds of recent decisions.
 */
export default function DecisionsCard({ decisions }: DecisionsCardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Methods present in the current dataset, sorted by frequency.
  const methodOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of decisions)
      counts.set(d.method, (counts.get(d.method) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [decisions]);

  const filtered = useMemo(
    () =>
      selected ? decisions.filter((d) => d.method === selected) : decisions,
    [decisions, selected],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`px-2 py-1 tracking-wider uppercase transition-colors ${
            selected === null
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          all · {decisions.length}
        </button>
        {methodOptions.map(([method, count]) => {
          const isActive = selected === method;
          const c = methodColor(method);
          return (
            <button
              key={method}
              type="button"
              onClick={() => setSelected(isActive ? null : method)}
              className="px-2 py-1 tracking-wider uppercase transition-opacity"
              style={{
                color: isActive ? '#fff' : c,
                background: isActive ? c : `${c}14`,
                opacity: isActive || selected === null ? 1 : 0.55,
              }}
            >
              {methodLabel(method)} · {count}
            </button>
          );
        })}
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        <DecisionsTable decisions={filtered} />
      </div>
    </div>
  );
}
