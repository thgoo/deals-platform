import { formatRelativeTime } from './format';

interface HealthIndicatorProps {
  lastDealAt: string | null;
}

/**
 * Pulse + status text. Buckets the freshness of the latest deal into
 * green / yellow / red — this is the operator's "is anything broken?" glance.
 *
 *   < 15 min   → green   (healthy)
 *   < 1 hour   → yellow  (slow but not dead)
 *   ≥ 1 hour   → red     (probably broken — last deal stale)
 */
export default function HealthIndicator({ lastDealAt }: HealthIndicatorProps) {
  const status = classify(lastDealAt);
  const dotClass =
    status === 'healthy' ? '' : status === 'slow' ? 'warn' : 'danger';
  const text =
    status === 'healthy'
      ? 'pipeline healthy'
      : status === 'slow'
        ? 'pipeline slow'
        : 'pipeline stalled';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`pulse-dot ${dotClass}`} aria-hidden />
      <span className="font-medium text-zinc-700">{text}</span>
      <span className="text-zinc-400">·</span>
      <span className="mono text-zinc-500">
        last {formatRelativeTime(lastDealAt)}
      </span>
    </div>
  );
}

function classify(lastDealAt: string | null): 'healthy' | 'slow' | 'stalled' {
  if (!lastDealAt) return 'stalled';
  const ageMs = Date.now() - new Date(lastDealAt).getTime();
  if (Number.isNaN(ageMs)) return 'stalled';
  if (ageMs < 15 * 60_000) return 'healthy';
  if (ageMs < 60 * 60_000) return 'slow';
  return 'stalled';
}
