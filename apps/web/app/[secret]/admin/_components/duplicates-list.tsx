import type { DuplicateSuspect } from '../_lib/types';

interface DuplicatesListProps {
  suspects: DuplicateSuspect[];
  emptyText?: string;
}

/**
 * Pairs of likely-duplicate products. Each row is two `products.id` rows that
 * embed to nearly the same vector — i.e., real duplicates in the catalog.
 *
 * The IDs are shown next to each name so the operator can target them in a
 * manual merge (UPDATE deals SET product_id = X WHERE product_id = Y;
 * then DELETE product Y). When the merge endpoint lands these become clickable.
 */
export default function DuplicatesList({
  suspects,
  emptyText = 'no duplicate suspects above threshold',
}: DuplicatesListProps) {
  if (suspects.length === 0) {
    return <div className="text-xs text-zinc-400">{emptyText}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-zinc-500">
        Each pair is two catalog rows that should be one product. Manual merge:
        repoint deals from B → A, then delete B.
      </p>
      <ul className="flex flex-col divide-y divide-zinc-100">
        {suspects.map((s, i) => {
          const width = Math.max(8, ((s.similarity - 0.7) / 0.3) * 100);
          return (
            <li
              key={`${s.productA.id}-${s.productB.id}-${i}`}
              className="grid grid-cols-[1fr_auto] gap-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <ProductRow
                  prefix="A"
                  id={s.productA.id}
                  name={s.productA.canonicalName}
                />
                <ProductRow
                  prefix="B"
                  id={s.productB.id}
                  name={s.productB.canonicalName}
                />
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
    </div>
  );
}

interface ProductRowProps {
  prefix: 'A' | 'B';
  id: string;
  name: string;
}

function ProductRow({ prefix, id, name }: ProductRowProps) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="mono w-3 text-[10px] text-zinc-400">{prefix}</span>
      <span className="truncate text-xs text-zinc-800">{name}</span>
      <span
        className="mono shrink-0 text-[10px] text-zinc-400 tabular-nums select-all"
        title={id}
      >
        {id.slice(0, 8)}
      </span>
    </div>
  );
}
