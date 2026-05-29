'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnalyzedDeal, ProductAnalysis } from '../_lib/types';
import { analyzeProduct, cleanProduct } from '../_actions/cleanup';
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

  // Lock the page scroll behind the modal and close on Escape.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const median = analysis?.median ?? 0;

  const toggle = (dealId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  const handleClean = async () => {
    if (selected.size === 0) return;
    setPhase('cleaning');
    try {
      const result = await cleanProduct(productId, [...selected]);
      setUnlinkedCount(result.unlinked);
      setPhase('done');
      onCleaned();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const shown = analysis ? analysis.deals.slice(0, visible) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[1px]"
      onClick={onClose}
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
              onClick={onClose}
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
            <div className="text-zinc-400">
              $ analyze &quot;{truncate(canonicalName, 60)}&quot;
            </div>

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
                  ▸ checked = will be unlinked. Suggestions pre-ticked (
                  <span style={{ color: '#dc2626' }}>red</span>); override
                  freely — you decide.
                </div>

                {/* Column header — widths mirror DealLine. */}
                <div className="mt-3 flex items-center gap-2 border-b border-zinc-200 pb-1 text-[10px] tracking-wider text-zinc-400 uppercase">
                  <span className="w-3 shrink-0" title="unlink?">
                    ✓
                  </span>
                  <span className="w-14 shrink-0">suggest</span>
                  <span className="w-24 shrink-0 text-right">price</span>
                  <span className="w-10 shrink-0 text-right">off</span>
                  <span className="flex-1">product</span>
                  <span className="hidden shrink-0 sm:inline">why</span>
                </div>

                <div className="mt-1 flex flex-col gap-0.5">
                  {shown.map((d) => (
                    <DealLine
                      key={d.dealId}
                      deal={d}
                      median={median}
                      checked={selected.has(d.dealId)}
                      disabled={phase !== 'review'}
                      onToggle={() => toggle(d.dealId)}
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
                onClick={onClose}
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

function DealLine({
  deal,
  median,
  checked,
  disabled,
  onToggle,
}: {
  deal: AnalyzedDeal;
  median: number;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const color = VERDICT_COLOR[deal.verdict] ?? '#a1a1aa';
  const ratio =
    median > 0 && deal.price > 0
      ? deal.price > median
        ? deal.price / median
        : median / deal.price
      : 0;

  return (
    <label className="flex cursor-pointer items-center gap-2 hover:bg-zinc-100">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="h-3 w-3 shrink-0 accent-red-600"
      />
      <span style={{ color }} className="w-14 shrink-0">
        {deal.verdict}
      </span>
      <span className="w-24 shrink-0 text-right text-zinc-500 tabular-nums">
        {formatBRL(deal.price)}
      </span>
      <span className="w-10 shrink-0 text-right text-zinc-400">
        {ratio >= 2 ? `${ratio.toFixed(0)}×` : ''}
      </span>
      <span className="flex-1 truncate text-zinc-700">
        {deal.product ?? '—'}
      </span>
      <span className="hidden shrink-0 text-zinc-400 sm:inline">
        {REASON_LABEL[deal.reason] ?? deal.reason}
      </span>
    </label>
  );
}

function Blink() {
  return <span className="animate-pulse">_</span>;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
