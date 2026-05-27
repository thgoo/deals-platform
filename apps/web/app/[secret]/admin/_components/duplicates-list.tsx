import type { DuplicateSuspect } from '../_lib/types';

interface DuplicatesListProps {
  suspects: DuplicateSuspect[];
  emptyText?: string;
}

/**
 * Pairs of likely-duplicate products. The similarity score lives at the right
 * with a small horizontal bar — wider = more confident this is the same product.
 * Sorted by similarity desc on the backend.
 */
export default function DuplicatesList({
  suspects,
  emptyText = 'no duplicate suspects above threshold',
}: DuplicatesListProps) {
  if (suspects.length === 0) {
    return <div className="text-xs text-zinc-400">{emptyText}</div>;
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-100">
      {suspects.map((s, i) => {
        const width = Math.max(8, ((s.similarity - 0.7) / 0.3) * 100);
        return (
          <li
            key={`${s.productA.id}-${s.productB.id}-${i}`}
            className="grid grid-cols-[1fr_auto] gap-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="truncate text-xs text-zinc-800">
                {s.productA.canonicalName}
              </div>
              <div className="truncate text-xs text-zinc-500">
                ↳ {s.productB.canonicalName}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-16 bg-zinc-100">
                <div
                  className="h-full bg-fuchsia-500"
                  style={{ width: `${Math.min(100, width)}%` }}
                />
              </div>
              <span className="mono w-10 text-right text-xs text-zinc-700 tabular-nums">
                {(s.similarity * 100).toFixed(1)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
