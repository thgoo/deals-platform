import type { SourceStat } from '../_lib/types';
import { formatNumber } from './format';

interface SourcesTableProps {
  sources: SourceStat[];
}

/**
 * Url-mappings broken down by source. The chip on the right marks each row
 * as either a `specific` parser (Amazon, ML, Kabum, ...) or the catch-all
 * host-fallback. Reading top-down should show the specific ones leading —
 * if Amazon falls to zero, the parser is broken.
 */
export default function SourcesTable({ sources }: SourcesTableProps) {
  if (sources.length === 0) {
    return <div className="text-xs text-zinc-400">no mappings yet</div>;
  }

  const max = sources[0]?.mappings ?? 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left tracking-wider text-zinc-400 uppercase">
          <tr className="border-b border-zinc-200">
            <th className="py-2 pr-4 font-medium">source</th>
            <th className="py-2 pr-4 text-right font-medium">mappings</th>
            <th className="py-2 pr-4 text-right font-medium">
              unique products
            </th>
            <th className="py-2 pr-4 font-medium">share</th>
            <th className="py-2 pr-0 text-right font-medium">type</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const width = Math.max(2, (s.mappings / max) * 100);
            const isSpecific = s.identifierType === 'specific';
            return (
              <tr
                key={s.source}
                className="border-b border-zinc-100 last:border-0"
              >
                <td className="mono py-2 pr-4 text-zinc-800">{s.source}</td>
                <td className="mono py-2 pr-4 text-right text-zinc-900 tabular-nums">
                  {formatNumber(s.mappings)}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-700 tabular-nums">
                  {formatNumber(s.uniqueProducts)}
                </td>
                <td className="py-2 pr-4">
                  <div className="h-1 w-24 bg-zinc-100">
                    <div
                      className="h-full"
                      style={{
                        width: `${width}%`,
                        background: isSpecific ? '#06b6d4' : '#a1a1aa',
                      }}
                    />
                  </div>
                </td>
                <td className="py-2 pr-0 text-right">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wider uppercase"
                    style={{
                      color: isSpecific ? '#0e7490' : '#71717a',
                      background: isSpecific
                        ? 'rgba(8, 145, 178, 0.08)'
                        : 'rgba(161, 161, 170, 0.12)',
                    }}
                  >
                    {s.identifierType}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
