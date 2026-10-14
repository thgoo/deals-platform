import Link from 'next/link';
import type {
  ExplorerProduct,
  ExplorerSortField,
  SortOrder,
} from '../../_lib/types';
import { formatBRL, formatNumber } from '../../_components/format';

interface Column {
  key: ExplorerSortField;
  label: string;
  align: 'left' | 'right';
}

const COLUMNS: Column[] = [
  { key: 'deals', label: 'deals', align: 'right' },
  { key: 'p10', label: 'floor · p10', align: 'right' },
  { key: 'median', label: 'median', align: 'right' },
  { key: 'spread', label: 'spread', align: 'right' },
  { key: 'created_at', label: 'added', align: 'right' },
];

interface ProductsTableProps {
  items: ExplorerProduct[];
  sort: ExplorerSortField;
  order: SortOrder;
  /** Builds a URL that changes the sort, toggles order if same column. */
  buildSortHref: (col: ExplorerSortField) => string;
  /** Base path for product detail links, e.g. "/<secret>/admin/products". */
  basePath: string;
}

/**
 * Products table with server-side sortable columns. Clicking a column header
 * navigates to the same page sorted by that field; clicking again toggles
 * asc ↔ desc. All state lives in the URL (nuqs-friendly).
 */
export default function ProductsTable({
  items,
  sort,
  order,
  buildSortHref,
  basePath,
}: ProductsTableProps) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-zinc-400">
        no products found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left tracking-wider text-zinc-400 uppercase">
          <tr className="border-b border-zinc-200">
            <th className="py-2 pr-4 font-medium">product</th>
            <th className="py-2 pr-4 font-medium">category</th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`py-2 pr-4 font-medium ${col.align === 'right' ? 'text-right' : ''}`}
              >
                <Link
                  href={buildSortHref(col.key)}
                  className="inline-flex items-center gap-1 hover:text-cyan-700"
                >
                  {col.label}
                  {sort === col.key && (
                    <span style={{ color: 'var(--i-accent)' }}>
                      {order === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <ProductRow key={p.id} product={p} href={`${basePath}/${p.id}`} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRow({
  product: p,
  href,
}: {
  product: ExplorerProduct;
  href: string;
}) {
  const added = new Date(p.createdAt).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });

  const suspectSpread = p.spreadRatio !== null && p.spreadRatio > 3;

  return (
    <tr className="group border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50">
      <td className="max-w-sm truncate py-2 pr-4 font-medium">
        <Link href={href} className="text-zinc-800 hover:text-cyan-700">
          {p.canonicalName}
        </Link>
      </td>
      <td className="mono py-2 pr-4 text-[10px] tracking-wider text-zinc-500 uppercase">
        {p.category ?? '—'}
      </td>
      <td className="mono py-2 pr-4 text-right text-zinc-700 tabular-nums">
        {formatNumber(p.deals)}
      </td>
      <td className="mono py-2 pr-4 text-right text-emerald-700 tabular-nums">
        {p.p10 != null ? formatBRL(p.p10) : '—'}
      </td>
      <td className="mono py-2 pr-4 text-right text-zinc-800 tabular-nums">
        {p.median != null ? formatBRL(p.median) : '—'}
      </td>
      <td className="mono py-2 pr-4 text-right tabular-nums">
        {p.spreadRatio != null ? (
          <span style={{ color: suspectSpread ? '#b91c1c' : '#a1a1aa' }}>
            {p.spreadRatio}×{suspectSpread ? ' ⚠' : ''}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="mono py-2 pr-0 text-right text-zinc-400 tabular-nums">
        {added}
      </td>
    </tr>
  );
}
