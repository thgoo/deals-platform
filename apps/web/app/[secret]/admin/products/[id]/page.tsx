import type { TimelineEvent } from '../../_lib/types';
import BracketCard from '../../_components/bracket-card';
import { formatBRL } from '../../_components/format';
import PriceFloorChart from '../../_components/price-floor-chart';
import { dashboardApi } from '../../_lib/api';
import BackButton from './_components/back-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ secret: string; id: string }>;
}

// ── Narrative builder ──────────────────────────────────────────────────────

type MarkerKind = 'debut' | 'new-store' | 'drop' | 'rise' | 'normal';

interface RichEvent {
  event: TimelineEvent;
  /** Verb phrase only — no store name embedded (store renders as a chip). */
  narrative: string;
  /** Optional follow-up sentence, e.g. for new-store with a price change. */
  context: string | null;
  marker: MarkerKind;
  isLast: boolean;
  /** Percentage change vs previous priced event. Null when not applicable. */
  pctChange: number | null;
  /** Resolved store name. Null = store was not identified. */
  store: string | null;
}

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

// ── Marker ────────────────────────────────────────────────────────────────

const MARKER_STYLES: Record<MarkerKind, { color: string; symbol: string }> = {
  debut: { color: '#0891b2', symbol: '◆' },
  'new-store': { color: '#0891b2', symbol: '●' },
  drop: { color: '#16a34a', symbol: '↓' },
  rise: { color: '#ea580c', symbol: '↑' },
  normal: { color: '#d4d4d8', symbol: '○' },
};

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

  const richEvents = buildRichEvents(detail.events.filter((e) => e.price > 0));

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
              <div>
                {/* Short line above the first dot so the track looks continuous */}
                <div className="ml-2.5 h-3 w-px bg-zinc-200" />
                {richEvents.map((re) => (
                  <TimelineItem key={re.event.dealId} rich={re} />
                ))}
              </div>
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

// ── StoreChip ─────────────────────────────────────────────────────────────

/** Store name rendered inline — same font size as surrounding text, just colored. */
function StoreChip({ store }: { store: string | null }) {
  return (
    <span
      className="bg-red-50 px-1 py-0.5 text-xs tracking-wider"
      style={
        store
          ? { color: '#0e7490', background: 'rgba(8,145,178,0.08)' }
          : { color: '#a1a1aa', background: 'rgba(161,161,170,0.12)' }
      }
    >
      {store ?? 'loja desconhecida'}
    </span>
  );
}

// ── TimelineItem ──────────────────────────────────────────────────────────

function TimelineItem({ rich }: { rich: RichEvent }) {
  const {
    event: e,
    narrative,
    context,
    marker,
    isLast,
    pctChange,
    store,
  } = rich;
  const style = MARKER_STYLES[marker];

  const dateStr = new Date(e.ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const showPctBadge = pctChange !== null && Math.abs(pctChange) >= 1;
  const pctIsRise = pctChange !== null && pctChange > 0;

  return (
    <div className="flex gap-4">
      {/* Vertical track */}
      <div className="flex flex-col items-center pt-0.5">
        <span
          className="mono flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none select-none"
          style={{ color: style.color }}
        >
          {style.symbol}
        </span>
        {!isLast && (
          <div
            className="mt-1 w-px flex-1 bg-zinc-200"
            style={{ minHeight: '1.5rem' }}
          />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${!isLast ? 'pb-6' : 'pb-1'}`}>
        <span className="mono text-[11px] text-zinc-400">{dateStr}</span>

        <p className="mt-0.5 text-sm text-zinc-700">
          {narrative} <StoreChip store={store} />.
          {context && <span className="text-zinc-500"> {context}</span>}
        </p>

        {/* Badges: price · variation · coupons */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mono text-sm font-semibold text-zinc-900">
            {formatBRL(e.price)}
          </span>

          {showPctBadge && (
            <span
              className="mono inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: pctIsRise ? '#ea580c' : '#16a34a',
                background: pctIsRise
                  ? 'rgba(234,88,12,0.08)'
                  : 'rgba(22,163,74,0.08)',
              }}
            >
              {pctIsRise ? '↑' : '↓'} {Math.abs(pctChange!).toFixed(0)}%
            </span>
          )}

          {e.coupons?.map((c) => (
            <span
              key={c.code}
              className="mono inline-flex items-center gap-1 border border-dashed border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500"
            >
              {c.code}
              {c.discount && (
                <span style={{ color: '#16a34a' }}>−{c.discount}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
