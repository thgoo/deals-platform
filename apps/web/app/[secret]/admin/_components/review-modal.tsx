'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnalyzedDeal, ProductAnalysis } from '../_lib/types';
import { analyzeProduct, cleanProduct } from '../_actions/cleanup';
import { formatBRL } from './format';

interface ReviewModalProps {
  productId: string;
  canonicalName: string;
  onClose: () => void;
  onCleaned: () => void;
}

type Phase = 'scanning' | 'review' | 'cleaning' | 'done' | 'error';

const VERDICT_COLOR: Record<string, string> = {
  unlink: '#f87171', // red-400
  keep: '#4ade80', // green-400
  review: '#fbbf24', // amber-400
};

const REASON_LABEL: Record<string, string> = {
  unrelated: 'no shared tokens — different product',
  spec_mismatch: 'shared name but conflicting spec',
  no_name: 'no extracted name — manual check',
  ok: 'matches',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500/80" />
            <span className="mono ml-2 text-zinc-400">
              catalog-review · {productId.slice(0, 8)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Terminal body */}
        <div
          ref={logRef}
          className="mono flex-1 overflow-y-auto bg-zinc-950 px-4 py-3 text-xs leading-relaxed text-zinc-300"
        >
          <div className="text-zinc-500">
            $ analyze &quot;{truncate(canonicalName, 60)}&quot;
          </div>

          {phase === 'scanning' && (
            <div className="mt-1 text-amber-400">
              ▸ scanning deals
              <Blink />
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-1 text-red-400">✗ {error}</div>
          )}

          {analysis && (
            <>
              <div className="mt-1 text-zinc-500">
                ▸ {analysis.deals.length} deals · median {formatBRL(median)}
              </div>
              <div className="mt-2 flex flex-col gap-0.5">
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
                <div className="mt-2 text-zinc-500">
                  ▸ suggested:{' '}
                  <span className="text-red-400">
                    {analysis.summary.unlink} unlink
                  </span>
                  {' · '}
                  <span className="text-green-400">
                    {analysis.summary.keep} keep
                  </span>
                  {analysis.summary.review > 0 && (
                    <>
                      {' · '}
                      <span className="text-amber-400">
                        {analysis.summary.review} review
                      </span>
                    </>
                  )}
                </div>
              )}

              {phase === 'cleaning' && (
                <div className="mt-1 text-amber-400">
                  ▸ unlinking
                  <Blink />
                </div>
              )}
              {phase === 'done' && (
                <div className="mt-1 text-green-400">
                  ✓ unlinked {unlinkedCount} deal(s). Run `bun run
                  backfill:products` to re-resolve them.
                </div>
              )}
            </>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-4 py-3">
          <span className="mono text-xs text-zinc-400">
            {phase === 'done' ? 'done' : `${selected.size} selected to unlink`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
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
                className="bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Unlink {selected.size} deal(s)
              </button>
            )}
          </div>
        </div>
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
    <label className="flex cursor-pointer items-center gap-2 hover:bg-zinc-900/60">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="h-3 w-3 shrink-0 accent-red-500"
      />
      <span style={{ color }} className="w-14 shrink-0">
        {deal.verdict}
      </span>
      <span className="w-24 shrink-0 text-right text-zinc-400 tabular-nums">
        {formatBRL(deal.price)}
      </span>
      <span className="w-10 shrink-0 text-right text-zinc-600">
        {ratio >= 2 ? `${ratio.toFixed(0)}×` : ''}
      </span>
      <span className="flex-1 truncate text-zinc-300">
        {deal.product ?? '—'}
      </span>
      <span className="hidden shrink-0 text-zinc-600 sm:inline">
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
