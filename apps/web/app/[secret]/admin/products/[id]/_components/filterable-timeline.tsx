'use client';

import { useState } from 'react';
import type {
  TimelineMarkerKind,
  TimelineRichEvent,
} from '../../../_lib/types';
import { formatBRL } from '../../../_components/format';

// ── Marker config ─────────────────────────────────────────────────────────────

const MARKER: Record<TimelineMarkerKind, { color: string; symbol: string }> = {
  debut: { color: '#0891b2', symbol: '◆' },
  'new-store': { color: '#0891b2', symbol: '●' },
  drop: { color: '#16a34a', symbol: '↓' },
  rise: { color: '#ea580c', symbol: '↑' },
  normal: { color: '#d4d4d8', symbol: '○' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface FilterableTimelineProps {
  events: TimelineRichEvent[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilterableTimeline({
  events,
}: FilterableTimelineProps) {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  // Unique stores that actually appear in this product's events, preserving
  // first-seen order (oldest first) so chips feel chronological.
  const stores = [
    ...new Set(
      [...events]
        .reverse()
        .map((e) => e.store)
        .filter((s): s is string => s !== null),
    ),
  ];

  // Recompute isLast on the filtered slice — the connecting line should stop
  // at the last *visible* item, not the last item in the original array.
  const filtered = selectedStore
    ? events.filter((e) => e.store === selectedStore)
    : events;

  const display = filtered.map((e, i) => ({
    ...e,
    isLast: i === filtered.length - 1,
  }));

  return (
    <div>
      {/* Store filter chips — only rendered when there are 2+ distinct stores */}
      {stores.length >= 2 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <StoreChip
            label="todas"
            active={selectedStore === null}
            onClick={() => setSelectedStore(null)}
          />
          {stores.map((s) => (
            <StoreChip
              key={s}
              label={s}
              active={selectedStore === s}
              onClick={() => setSelectedStore(s)}
            />
          ))}
        </div>
      )}

      {/* Timeline */}
      {display.length === 0 ? (
        <p className="text-xs text-zinc-400">nenhum evento para esta loja</p>
      ) : (
        <div>
          <div className="ml-2.5 h-3 w-px bg-zinc-200" />
          {display.map((re) => (
            <TimelineItem key={re.event.dealId} rich={re} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Store chip ────────────────────────────────────────────────────────────────

function StoreChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="label-eyebrow px-2.5 py-1 transition-colors"
      style={
        active
          ? { color: 'var(--i-accent)', background: 'var(--i-accent-glow)' }
          : { color: 'var(--i-text-muted)' }
      }
    >
      {label}
    </button>
  );
}

// ── Timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({
  rich,
}: {
  rich: TimelineRichEvent & { isLast: boolean };
}) {
  const {
    event: e,
    narrative,
    context,
    marker,
    isLast,
    pctChange,
    store,
  } = rich;
  const m = MARKER[marker];

  const dateStr = new Date(e.ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const showPctBadge = pctChange !== null && Math.abs(pctChange) >= 1;
  const pctIsRise = pctChange !== null && pctChange > 0;

  return (
    <div className="flex gap-4">
      {/* Vertical track: marker + connecting line */}
      <div className="flex flex-col items-center pt-0.5">
        <span
          className="mono flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none select-none"
          style={{ color: m.color }}
        >
          {m.symbol}
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
          {narrative}{' '}
          <span
            className="font-medium"
            style={{ color: store ? '#0891b2' : '#a1a1aa' }}
          >
            {store ?? 'loja desconhecida'}
          </span>
          {context && <span className="text-zinc-500"> {context}</span>}
        </p>

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
