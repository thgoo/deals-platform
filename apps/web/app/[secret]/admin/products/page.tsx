import type { ExplorerSortField, SortOrder } from '../_lib/types';
import BracketCard from '../_components/bracket-card';
import { dashboardApi } from '../_lib/api';
import Pagination from './_components/pagination';
import ProductsSearch from './_components/products-search';
import ProductsTable from './_components/products-table';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ secret: string }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}

const VALID_SORTS = new Set<ExplorerSortField>([
  'deals',
  'p10',
  'median',
  'spread',
  'created_at',
]);

function parseSort(raw: string | undefined): ExplorerSortField {
  return VALID_SORTS.has(raw as ExplorerSortField)
    ? (raw as ExplorerSortField)
    : 'deals';
}

function parseOrder(raw: string | undefined): SortOrder {
  return raw === 'asc' ? 'asc' : 'desc';
}

/**
 * Product explorer: server-rendered search + sortable table + pagination.
 * All state lives in the URL so pages are shareable and the back button works.
 */
export default async function ProductsPage({ params, searchParams }: Props) {
  const [{ secret }, sp] = await Promise.all([params, searchParams]);

  const q = sp.q ?? '';
  const sort = parseSort(sp.sort);
  const order = parseOrder(sp.order);
  const page = Math.max(1, Number(sp.page ?? 1));

  const result = await dashboardApi
    .products({ q, sort, order, page, limit: 20 })
    .catch(() => ({ items: [], total: 0, page: 1, pages: 1 }));

  /** Build a new URL with any overrides applied to the current params. */
  const buildUrl = (overrides: Record<string, string | number | undefined>) => {
    const base = `/${secret}/admin/products`;
    const merged: Record<string, string> = {
      ...(q ? { q } : {}),
      ...(sort !== 'deals' ? { sort } : {}),
      ...(order !== 'desc' ? { order } : {}),
      ...(page !== 1 ? { page: String(page) } : {}),
    };
    for (const [k, v] of Object.entries(overrides)) {
      if (
        v === undefined ||
        v === '' ||
        v === 'deals' ||
        v === 'desc' ||
        v === 1
      ) {
        delete merged[k];
      } else {
        merged[k] = String(v);
      }
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `${base}?${qs}` : base;
  };

  const basePath = `/${secret}/admin/products`;

  const buildSortHref = (col: ExplorerSortField) => {
    const nextOrder: SortOrder =
      col === sort && order === 'desc' ? 'asc' : 'desc';
    return buildUrl({ sort: col, order: nextOrder, page: 1 });
  };

  const buildPageHref = (p: number) => buildUrl({ page: p });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="scanlines mb-8 flex items-end justify-between border-b border-zinc-200 pb-5">
        <div className="flex flex-col gap-1">
          <span className="label-eyebrow">catalog</span>
          <h1 className="text-3xl font-light tracking-tight text-zinc-900">
            products
          </h1>
        </div>
        <span className="mono text-[11px] text-zinc-400">
          {result.total.toLocaleString('pt-BR')} total
        </span>
      </header>

      <BracketCard className="flex flex-col gap-5">
        {/* Search */}
        <div className="w-full max-w-sm">
          <ProductsSearch key={q} defaultValue={q} basePath={basePath} />
        </div>

        {/* Table */}
        <ProductsTable
          items={result.items}
          sort={sort}
          order={order}
          buildSortHref={buildSortHref}
          basePath={basePath}
        />

        {/* Pagination */}
        <Pagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          buildHref={buildPageHref}
        />
      </BracketCard>
    </main>
  );
}
