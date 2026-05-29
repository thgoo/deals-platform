'use client';

import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyzedDeal, ProductAnalysis } from '../_lib/types';
import {
  analyzeProduct,
  cleanProduct,
  deleteDeal,
  updateDealPrice,
  updateProductName,
} from '../_actions/cleanup';
import BracketCard from './bracket-card';
import { formatBRL } from './format';

interface ReviewModalProps {
  productId: string;
  canonicalName: string;
  onClose: () => void;
  onCleaned: () => void;
}

type Phase = 'scanning' | 'review' | 'cleaning' | 'done' | 'error';

// Aligned with the dashboard's design tokens (intelligence.css):
// danger / success / warning.
const VERDICT_COLOR: Record<string, string> = {
  unlink: '#dc2626', // --i-danger
  keep: '#16a34a', // --i-success
  review: '#ea580c', // --i-warning
};

const REASON_LABEL: Record<string, string> = {
  unrelated: 'different product',
  spec_mismatch: 'different variant / spec',
  no_name: 'no name — check it',
  ok: 'name matches',
};

/** Reveal lines progressively so the analysis reads like a terminal working. */
const REVEAL_INTERVAL_MS = 28;

export default function ReviewModal({
  productId,
  canonicalName,
  onClose,
  onCleaned,
}: ReviewModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [visible, setVisible] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [error, setError] = useState<string>('');
  // Set by any mutation; on close we refresh the page once so the queue and
  // price panels behind recompute — instead of revalidating on every edit.
  const [dirty, setDirty] = useState(false);
  // Product name is editable (curation); kept in local state so the title
  // reflects a rename immediately.
  const [name, setName] = useState(canonicalName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  // Fetch the analysis on mount.
  useEffect(() => {
    let alive = true;
    analyzeProduct(productId)
      .then((data) => {
        if (!alive) return;
        setAnalysis(data);
        setSelected(
          new Set(
            data.deals
              .filter((d) => d.verdict === 'unlink')
              .map((d) => d.dealId),
          ),
        );
        setPhase('review');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  // Progressive reveal of the deal lines.
  useEffect(() => {
    if (phase !== 'review' || !analysis) return;
    if (visible >= analysis.deals.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [phase, analysis, visible]);

  // Keep the log scrolled to the newest line while revealing.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visible]);

  // Refresh the page once on close (only if something changed), then unmount.
  const finishAndClose = useCallback(() => {
    if (dirty) onCleaned();
    onClose();
  }, [dirty, onCleaned, onClose]);

  // Lock the page scroll behind the modal and close on Escape.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishAndClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [finishAndClose]);

  // Median is recomputed live from the current deals so price edits / deletes
  // reflect immediately without re-fetching.
  const median = analysis ? medianOf(analysis.deals.map((d) => d.price)) : 0;

  const toggle = (dealId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  const handleEditPrice = async (dealId: number, priceCents: number) => {
    await updateDealPrice(dealId, priceCents);
    setDirty(true);
    setAnalysis((prev) => {
      if (!prev) return prev;
      const deals = prev.deals.map((d) =>
        d.dealId === dealId ? { ...d, price: priceCents } : d,
      );
      return { ...prev, deals };
    });
  };

  const handleDelete = async (dealId: number) => {
    await deleteDeal(dealId);
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(dealId);
      return next;
    });
    setAnalysis((prev) => {
      if (!prev) return prev;
      const removed = prev.deals.find((d) => d.dealId === dealId);
      const deals = prev.deals.filter((d) => d.dealId !== dealId);
      const summary = { ...prev.summary };
      if (removed)
        summary[removed.verdict] = Math.max(0, summary[removed.verdict] - 1);
      return { ...prev, deals, summary };
    });
    setVisible((v) => Math.max(0, v - 1));
  };

  const saveRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setEditingName(false);
      return;
    }
    await updateProductName(productId, trimmed);
    setName(trimmed);
    setDirty(true);
    setEditingName(false);
  };

  const handleClean = async () => {
    if (selected.size === 0) return;
    setPhase('cleaning');
    try {
      const result = await cleanProduct(productId, [...selected]);
      setUnlinkedCount(result.unlinked);
      setPhase('done');
      setDirty(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const shown = analysis ? analysis.deals.slice(0, visible) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[1px]"
      onClick={finishAndClose}
    >
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <BracketCard className="flex max-h-[85vh] w-full flex-col gap-4">
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 pb-3">
            <div className="flex flex-col gap-1">
              <span className="label-eyebrow">catalog · review</span>
              <span className="mono text-[10px] text-zinc-400">
                {productId.slice(0, 8)}
              </span>
            </div>
            <button
              onClick={finishAndClose}
              className="text-zinc-400 transition-colors hover:text-cyan-700"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Operator log */}
          <div
            ref={logRef}
            className="mono min-h-0 flex-1 overflow-y-auto text-xs leading-relaxed text-zinc-600"
          >
            {editingName ? (
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="shrink-0">$ analyze</span>
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveRename();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="min-w-0 flex-1 border-b border-cyan-600 bg-transparent text-zinc-700 outline-none"
                />
                <button
                  onClick={() => void saveRename()}
                  title="Save name"
                  aria-label="Save name"
                  className="shrink-0 text-emerald-600 hover:text-emerald-700"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  title="Cancel"
                  aria-label="Cancel rename"
                  className="shrink-0 text-zinc-400 hover:text-zinc-700"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="group/name flex items-center gap-1.5 text-zinc-400">
                <span className="shrink-0">$ analyze</span>
                <span
                  className="min-w-0 flex-1 truncate text-zinc-500"
                  title={name}
                >
                  &quot;{name}&quot;
                </span>
                <button
                  onClick={() => {
                    setNameDraft(name);
                    setEditingName(true);
                  }}
                  title="Rename product"
                  aria-label="Rename product"
                  className="shrink-0 text-zinc-300 opacity-0 transition group-hover/name:opacity-100 hover:text-cyan-700"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}

            {phase === 'scanning' && (
              <div className="mt-1" style={{ color: '#ea580c' }}>
                ▸ scanning deals
                <Blink />
              </div>
            )}

            {phase === 'error' && (
              <div className="mt-1" style={{ color: '#dc2626' }}>
                ✗ {error}
              </div>
            )}

            {analysis && (
              <>
                <div className="mt-1 text-zinc-400">
                  ▸ {analysis.deals.length} deals · median {formatBRL(median)}
                </div>
                <div className="mt-1 text-zinc-500">
                  ▸ tick a row to unlink it. Suggestions are pre-ticked (
                  <span style={{ color: '#dc2626' }}>unlink</span> in red) —
                  override freely, you decide.
                </div>

                <div className="mt-2 flex flex-col">
                  {shown.map((d) => (
                    <DealLine
                      key={d.dealId}
                      deal={d}
                      median={median}
                      checked={selected.has(d.dealId)}
                      disabled={phase !== 'review'}
                      onToggle={() => toggle(d.dealId)}
                      onEditPrice={handleEditPrice}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>

                {visible >= analysis.deals.length && (
                  <div className="mt-2 text-zinc-400">
                    ▸ suggested:{' '}
                    <span style={{ color: '#dc2626' }}>
                      {analysis.summary.unlink} unlink
                    </span>
                    {' · '}
                    <span style={{ color: '#16a34a' }}>
                      {analysis.summary.keep} keep
                    </span>
                    {analysis.summary.review > 0 && (
                      <>
                        {' · '}
                        <span style={{ color: '#ea580c' }}>
                          {analysis.summary.review} review
                        </span>
                      </>
                    )}
                  </div>
                )}

                {phase === 'cleaning' && (
                  <div className="mt-1" style={{ color: '#ea580c' }}>
                    ▸ unlinking
                    <Blink />
                  </div>
                )}
                {phase === 'done' && (
                  <div className="mt-1" style={{ color: '#16a34a' }}>
                    ✓ unlinked {unlinkedCount} deal(s). Run `bun run
                    backfill:products` to re-resolve them.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action bar */}
          <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 pt-3">
            <span className="mono text-[11px] tracking-wider text-zinc-400 uppercase">
              {phase === 'done'
                ? 'done'
                : `${selected.size} selected to unlink`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={finishAndClose}
                className="border border-zinc-300 px-3 py-1.5 text-[11px] tracking-wider text-zinc-600 uppercase hover:bg-zinc-100"
              >
                {phase === 'done' ? 'Close' : 'Cancel'}
              </button>
              {phase !== 'done' && (
                <button
                  onClick={handleClean}
                  disabled={
                    selected.size === 0 ||
                    phase === 'cleaning' ||
                    phase === 'scanning'
                  }
                  className="border border-red-600 bg-red-600 px-3 py-1.5 text-[11px] font-medium tracking-wider text-white uppercase hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Unlink {selected.size} selected
                </button>
              )}
            </div>
          </div>
        </BracketCard>
      </div>
    </div>
  );
}

type RowMode = 'idle' | 'edit' | 'confirmDelete';

function DealLine({
  deal,
  median,
  checked,
  disabled,
  onToggle,
  onEditPrice,
  onDelete,
}: {
  deal: AnalyzedDeal;
  median: number;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEditPrice: (dealId: number, priceCents: number) => Promise<void>;
  onDelete: (dealId: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<RowMode>('idle');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const color = VERDICT_COLOR[deal.verdict] ?? '#a1a1aa';
  const reason = REASON_LABEL[deal.reason] ?? deal.reason;
  const fullName = deal.product ?? '—';
  const deviation = describeDeviation(deal.price, median);

  const startEdit = () => {
    setDraft((deal.price / 100).toFixed(2).replace('.', ','));
    setMode('edit');
  };

  const saveEdit = async () => {
    const cents = parseBrlToCents(draft);
    if (cents === null || cents === deal.price) {
      setMode('idle');
      return;
    }
    setBusy(true);
    try {
      await onEditPrice(deal.dealId, cents);
      setMode('idle');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await onDelete(deal.dealId);
      // Row unmounts on success; no state reset needed.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex items-baseline gap-1.5 py-0.5 hover:bg-zinc-100">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || mode !== 'idle'}
        onChange={onToggle}
        className="mr-1 h-3 w-3 shrink-0 translate-y-0.5 accent-red-600"
      />
      {/* suggestion + reason (colored by verdict) */}
      <span
        style={{ color }}
        className="shrink-0 cursor-pointer"
        onClick={onToggle}
      >
        {deal.verdict} suggested · {reason}
      </span>
      <span className="shrink-0 text-zinc-300">·</span>

      {/* price — editable */}
      {mode === 'edit' ? (
        <span className="inline-flex shrink-0 items-baseline gap-1">
          <span className="text-zinc-400">R$</span>
          <input
            autoFocus
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit();
              if (e.key === 'Escape') setMode('idle');
            }}
            className="w-20 border-b border-cyan-600 bg-transparent text-zinc-800 tabular-nums outline-none"
          />
        </span>
      ) : (
        <span
          className="shrink-0 cursor-pointer font-medium text-zinc-800 tabular-nums"
          onClick={onToggle}
        >
          {formatBRL(deal.price)}
        </span>
      )}

      {deviation && mode !== 'edit' && (
        <>
          <span className="shrink-0 text-zinc-300">·</span>
          <span className="shrink-0 text-zinc-400">{deviation}</span>
        </>
      )}
      <span className="shrink-0 text-zinc-300">·</span>

      {/* product name (full on hover) */}
      <span
        className="min-w-0 flex-1 cursor-pointer truncate text-zinc-600"
        title={fullName}
        onClick={onToggle}
      >
        {fullName}
      </span>

      {/* row actions */}
      {!disabled && (
        <span className="ml-2 flex shrink-0 items-center gap-2">
          {mode === 'idle' && (
            <>
              <button
                onClick={startEdit}
                title="Fix price"
                aria-label="Fix price"
                className="text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-cyan-700"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => setMode('confirmDelete')}
                title="Delete deal"
                aria-label="Delete deal"
                className="text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button
                onClick={() => void saveEdit()}
                disabled={busy}
                title="Save"
                aria-label="Save price"
                className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setMode('idle')}
                disabled={busy}
                title="Cancel"
                aria-label="Cancel"
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X size={13} />
              </button>
            </>
          )}
          {mode === 'confirmDelete' && (
            <span className="inline-flex items-center gap-2">
              <span style={{ color: '#dc2626' }}>delete?</span>
              <button
                onClick={() => void confirmDelete()}
                disabled={busy}
                className="tracking-wider text-red-600 uppercase hover:text-red-700 disabled:opacity-40"
              >
                yes
              </button>
              <button
                onClick={() => setMode('idle')}
                disabled={busy}
                className="tracking-wider text-zinc-400 uppercase hover:text-zinc-700"
              >
                no
              </button>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Human phrase for how far a price sits from the product's median. */
function describeDeviation(price: number, median: number): string {
  if (median <= 0 || price <= 0) return '';
  const ratio = price > median ? price / median : median / price;
  if (ratio < 1.3) return 'near median';
  const factor = ratio < 10 ? ratio.toFixed(1) : ratio.toFixed(0);
  return price > median ? `${factor}× over median` : `${factor}× under median`;
}

/** Median of prices (cents), ignoring zero/empty — mirrors the backend. */
function medianOf(prices: number[]): number {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

/**
 * Parses a user-typed BRL value into cents. Handles "367,46", "367.46",
 * "3.674,60" and "R$ 367,46". Returns null if it isn't a positive number.
 */
function parseBrlToCents(input: string): number | null {
  let s = input.replace(/r\$|\s/gi, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.'); // BR: dot=thousands, comma=decimal
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function Blink() {
  return <span className="animate-pulse">_</span>;
}
