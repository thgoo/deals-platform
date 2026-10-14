import type { MatchMethodStat } from '../_lib/types';
import {
  formatNumber,
  formatPercent,
  methodColor,
  methodLabel,
} from './format';

interface MethodsDonutProps {
  stats: MatchMethodStat[];
  size?: number;
}

/**
 * Hand-rolled SVG donut — no chart lib needed for this. Each slice is a partial
 * stroked circle (stroke-dasharray trick), so colors and gaps are easy to tune.
 *
 * The legend lives next to the donut with the absolute counts and shares.
 */
export default function MethodsDonut({ stats, size = 180 }: MethodsDonutProps) {
  const total = stats.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div className="text-xs text-zinc-400">no decisions recorded yet</div>
    );
  }

  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;

  // Pre-compute slice geometry once so the JSX map is referentially pure.
  const slices = computeSlices(stats, circumference);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
      >
        {/* Background ring — very light, just to ground the donut visually. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth={14}
        />
        {slices.map((slice) => (
          <circle
            key={slice.method}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={methodColor(slice.method)}
            strokeWidth={14}
            strokeDasharray={`${slice.length} ${slice.gap}`}
            strokeDashoffset={slice.offset}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="mono"
          fontSize="14"
          fill="#52525b"
        >
          {formatNumber(total)}
        </text>
      </svg>

      <ul className="flex flex-col gap-2 text-xs">
        {stats.map((s) => (
          <li
            key={s.method}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: methodColor(s.method) }}
              aria-hidden
            />
            <span className="text-zinc-700">{methodLabel(s.method)}</span>
            <span className="mono text-zinc-900 tabular-nums">
              {formatNumber(s.count)}
            </span>
            <span className="mono text-zinc-400 tabular-nums">
              {formatPercent(s.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Slice {
  method: string;
  length: number;
  gap: number;
  offset: number;
}

function computeSlices(
  stats: MatchMethodStat[],
  circumference: number,
): Slice[] {
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return [];
  const result: Slice[] = [];
  let cumLength = 0;
  for (const s of stats) {
    const length = (s.count / total) * circumference;
    result.push({
      method: s.method,
      length,
      gap: circumference - length,
      offset: -cumLength,
    });
    cumLength += length;
  }
  return result;
}
