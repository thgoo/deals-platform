import type {
  TimelineEvent,
  TimelineMarkerKind,
  TimelineRichEvent,
} from '../../_lib/types';
import BracketCard from '../../_components/bracket-card';
import { formatBRL } from '../../_components/format';
import PriceFloorChart from '../../_components/price-floor-chart';
import { dashboardApi } from '../../_lib/api';
import BackButton from './_components/back-button';
import FilterableTimeline from './_components/filterable-timeline';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ secret: string; id: string }>;
}

// ── Narrative builder ──────────────────────────────────────────────────────

// Use shared types from _lib/types so the client FilterableTimeline component
// can accept the same shape without duplicating the interface.
type MarkerKind = TimelineMarkerKind;
type RichEvent = TimelineRichEvent;

/**
 * Enriches raw events with narratives and visual markers.
 * Processing is oldest→newest for context; result is reversed for display.
 *
 * Narrative = verb + location only (no price, no coupon — those go in badges).
 */
function buildRichEvents(events: TimelineEvent[]): RichEvent[] {
  const oldestFirst = [...events].reverse();
  const seenStores = new Set<string>();
  let prevPrice: number | null = null;

  const rich = oldestFirst.map((e, i): RichEvent => {
    const store = e.store ?? null;
    const isFirst = i === 0;
    const isNewStore = store !== null && !seenStores.has(store);
    if (store) seenStores.add(store);

    const pctVsPrev =
      prevPrice && prevPrice > 0 && e.price > 0
        ? ((e.price - prevPrice) / prevPrice) * 100
        : null;

    if (e.price > 0) prevPrice = e.price;

    let narrative: string;
    let context: string | null = null;
    let marker: MarkerKind;

    if (isFirst) {
      narrative = 'Apareceu pela primeira vez em';
      marker = 'debut';
    } else if (isNewStore && store) {
      narrative = 'Visto pela primeira vez em';
      context =
        pctVsPrev !== null && pctVsPrev <= -1
          ? 'Preço caiu em relação à listagem anterior.'
          : pctVsPrev !== null && pctVsPrev >= 1
            ? 'Preço subiu em relação à listagem anterior.'
            : null;
      marker = 'new-store';
    } else if (pctVsPrev !== null && pctVsPrev <= -1) {
      narrative = 'Preço caiu em';
      marker = 'drop';
    } else if (pctVsPrev !== null && pctVsPrev >= 1) {
      narrative = 'Preço subiu em';
      marker = 'rise';
    } else {
      narrative = 'Listado novamente em';
      marker = 'normal';
    }

    return {
      event: e,
      narrative,
      context,
      marker,
      isLast: false,
      pctChange: pctVsPrev,
      store,
    };
  });

  const reversed = rich.reverse();
  if (reversed.length > 0) reversed[reversed.length - 1]!.isLast = true;
  return reversed;
}

// ── Page ──────────────────────────────────────────────────────────────────

const SPECIFIC_SOURCES = new Set([
  'amazon',
  'mercadolivre',
  'kabum',
  'magalu',
  'aliexpress',
  'shopee',
  'pichau',
  'terabyte',
]);

export default async function ProductDetailPage({ params }: Props) {
  const { secret, id } = await params;

  const detail = await dashboardApi.productDetail(id).catch(() => null);

  if (!detail) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <BackButton fallbackHref={`/${secret}/admin/products`} />
        <p className="mt-8 text-sm text-zinc-400">Product not found.</p>
      </main>
    );
  }

  const pricedEvents = detail.events.filter((e) => e.price > 0);
  const minEvent = pricedEvents.reduce<(typeof pricedEvents)[0] | null>(
    (min, e) => (min === null || e.price < min.price ? e : min),
    null,
  );
  // events are newest-first; latest is the first priced event
  const latestEvent = pricedEvents[0] ?? null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

  const richEvents = buildRichEvents(pricedEvents);

  const chartPoints = [...detail.events.filter((e) => e.price > 0)]
    .reverse()
    .map((e) => ({ ts: e.ts, price: e.price, store: e.store }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* ── Back nav ─────────────────────────────────────────────── */}
      <BackButton fallbackHref={`/${secret}/admin/products`} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="scanlines mt-4 mb-8 border-b border-zinc-200 pb-5">
        <div className="flex flex-col gap-1">
          <span className="label-eyebrow">
            {detail.category ?? 'uncategorized'}
          </span>
          <h1 className="text-2xl font-light tracking-tight text-zinc-900">
            {detail.canonicalName}
          </h1>
          <p className="mono text-[11px] text-zinc-400">
            {detail.events.length} deals · desde{' '}
            {new Date(detail.createdAt).toLocaleDateString('pt-BR', {
              month: 'short',
              year: 'numeric',
            })}
            {' · '}mediana {formatBRL(detail.median)}
          </p>
          {(minEvent ?? latestEvent) && (
            <p className="mono text-[11px] text-zinc-400">
              {minEvent && (
                <>
                  <span>mínimo </span>
                  <span className="text-zinc-700">
                    {formatBRL(minEvent.price)}
                  </span>
                  <span className="text-zinc-300">
                    {' '}
                    ({fmtDate(minEvent.ts)})
                  </span>
                </>
              )}
              {minEvent && latestEvent && latestEvent.ts !== minEvent.ts && (
                <span className="text-zinc-300"> · </span>
              )}
              {latestEvent && latestEvent.ts !== minEvent?.ts && (
                <>
                  <span>último </span>
                  <span className="text-zinc-700">
                    {formatBRL(latestEvent.price)}
                  </span>
                  <span className="text-zinc-300">
                    {' '}
                    ({fmtDate(latestEvent.ts)})
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {/* ── Timeline ─────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-sm font-medium tracking-widest text-zinc-700 uppercase">
            timeline
          </h2>
          <BracketCard>
            {richEvents.length === 0 ? (
              <p className="text-xs text-zinc-400">no priced events yet</p>
            ) : (
              <FilterableTimeline events={richEvents} />
            )}
          </BracketCard>
        </section>

        {/* ── Price chart ───────────────────────────────────────── */}
        {chartPoints.length >= 2 && (
          <section>
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="text-sm font-medium tracking-widest text-zinc-700 uppercase">
                price history
              </h2>
              <span className="text-xs text-zinc-400">
                floor {formatBRL(detail.p10)}
                {' · '}
                ceiling {formatBRL(detail.p90)}
              </span>
            </div>
            <BracketCard>
              <PriceFloorChart
                points={chartPoints}
                p10={detail.p10}
                median={detail.median}
                height={260}
              />
            </BracketCard>
          </section>
        )}

        {/* ── Sources ───────────────────────────────────────────── */}
        {detail.sources.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-medium tracking-widest text-zinc-700 uppercase">
              sources
            </h2>
            <BracketCard>
              <table className="w-full text-xs">
                <thead className="text-left tracking-wider text-zinc-400 uppercase">
                  <tr className="border-b border-zinc-200">
                    <th className="py-2 pr-4 font-medium">store</th>
                    <th className="py-2 pr-4 font-medium">id</th>
                    <th className="py-2 pr-0 text-right font-medium">type</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.sources.map((s) => (
                    <tr
                      key={`${s.source}:${s.externalId}`}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="mono py-2 pr-4 text-zinc-700">
                        {s.source}
                      </td>
                      <td className="mono py-2 pr-4 text-zinc-500">
                        {s.externalId}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <span
                          className="inline-flex items-center px-2 py-0.5 text-[10px] tracking-wider uppercase"
                          style={{
                            color: SPECIFIC_SOURCES.has(s.source)
                              ? '#0e7490'
                              : '#71717a',
                            background: SPECIFIC_SOURCES.has(s.source)
                              ? 'rgba(8,145,178,0.08)'
                              : 'rgba(161,161,170,0.12)',
                          }}
                        >
                          {SPECIFIC_SOURCES.has(s.source)
                            ? 'specific'
                            : 'fallback'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BracketCard>
          </section>
        )}
      </div>
    </main>
  );
}
