import type { NamedCount } from '../_lib/types';
import { formatNumber } from './format';

interface HorizontalBarsProps {
  rows: NamedCount[];
  emptyText?: string;
  /** Override the accent color (defaults to the dashboard's cyan). */
  color?: string;
}

/**
 * Plain CSS horizontal bars — no chart library. Bar widths are relative to the
 * top row (which is always the max in a count-desc list), so the visual scale
 * is intuitive without needing axes.
 */
export default function HorizontalBars({
  rows,
  emptyText = 'no data',
  color = '#06b6d4',
}: HorizontalBarsProps) {
  if (rows.length === 0) {
    return <div className="text-xs text-zinc-400">{emptyText}</div>;
  }

  const max = rows[0]?.count ?? 1;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const width = Math.max(2, (row.count / max) * 100);
        return (
          <li
            key={row.name}
            className="grid grid-cols-[1fr_auto] items-center gap-3"
          >
            <div className="flex flex-col gap-1">
              <span className="truncate text-xs text-zinc-700">{row.name}</span>
              <div className="h-1.5 w-full bg-zinc-100">
                <div
                  className="h-full transition-all"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
            </div>
            <span className="mono text-xs text-zinc-500 tabular-nums">
              {formatNumber(row.count)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
