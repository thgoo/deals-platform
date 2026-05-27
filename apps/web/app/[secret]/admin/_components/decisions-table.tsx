import type { RecentDecision } from '../_lib/types';
import { formatRelativeTime, methodColor, methodLabel } from './format';

interface DecisionsTableProps {
  decisions: RecentDecision[];
}

/**
 * Latest matching decisions. Useful for spot-checking after a prompt / threshold
 * change — the method chip is color-coded with the same palette as the donut.
 */
export default function DecisionsTable({ decisions }: DecisionsTableProps) {
  if (decisions.length === 0) {
    return <div className="text-xs text-zinc-400">no decisions yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left tracking-wider text-zinc-400 uppercase">
          <tr className="border-b border-zinc-200">
            <th className="py-2 pr-4 font-medium">when</th>
            <th className="py-2 pr-4 font-medium">deal</th>
            <th className="py-2 pr-4 font-medium">extracted (ai)</th>
            <th className="py-2 pr-4 font-medium">matched to</th>
            <th className="py-2 pr-4 font-medium">method</th>
            <th className="py-2 pr-0 text-right font-medium">score</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id} className="border-b border-zinc-100 last:border-0">
              <td className="mono py-2 pr-4 text-zinc-500 tabular-nums">
                {formatRelativeTime(d.createdAt)}
              </td>
              <td className="mono py-2 pr-4 text-zinc-700 tabular-nums">
                #{d.dealId}
              </td>
              <td className="max-w-[28ch] truncate py-2 pr-4 text-zinc-800">
                {d.dealProduct ?? <span className="text-zinc-400">—</span>}
              </td>
              <td className="max-w-[28ch] truncate py-2 pr-4 text-zinc-500">
                {d.method === 'created_new'
                  ? <span className="text-zinc-400">— new</span>
                  : d.productName ?? <span className="text-zinc-400">—</span>}
              </td>
              <td className="py-2 pr-4">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wider uppercase"
                  style={{
                    color: methodColor(d.method),
                    background: `${methodColor(d.method)}14`,
                  }}
                >
                  {methodLabel(d.method)}
                </span>
              </td>
              <td className="mono py-2 pr-0 text-right text-zinc-700 tabular-nums">
                {d.similarityScore === null ? (
                  <span className="text-zinc-400">—</span>
                ) : (
                  (d.similarityScore * 100).toFixed(1)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
