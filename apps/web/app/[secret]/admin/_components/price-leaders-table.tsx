import type { PriceLeader } from '../_lib/types';
import { formatBRL, formatNumber } from './format';

interface PriceLeadersTableProps {
  leaders: PriceLeader[];
  /** Highlight this product's row — it's the one shown in the chart above. */
  featuredId?: string;
}

/**
 * Products with the deepest price history, each with a robust price band
 * (p10 floor → median → p90 ceiling) computed over all their deals. The
 * `spread` column is p90/p10: clean promo swings sit around 1.2-2.0, while a
 * `suspect` chip flags an implausibly wide band — variant collapse (iPhone 16
 * vs 16e) or a mis-extraction. That chip is the seed of the cleanup queue.
 */
export default function PriceLeadersTable({
  leaders,
  featuredId,
}: PriceLeadersTableProps) {
  if (leaders.length === 0) {
    return <div className="text-xs text-zinc-400">no priced products yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left tracking-wider text-zinc-400 uppercase">
          <tr className="border-b border-zinc-200">
            <th className="py-2 pr-4 font-medium">product</th>
            <th className="py-2 pr-4 font-medium">category</th>
            <th className="py-2 pr-4 text-right font-medium">deals</th>
            <th className="py-2 pr-4 text-right font-medium">floor · p10</th>
            <th className="py-2 pr-4 text-right font-medium">median</th>
            <th className="py-2 pr-4 text-right font-medium">ceiling · p90</th>
            <th className="py-2 pr-0 text-right font-medium">spread</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((l) => {
            const isFeatured = l.productId === featuredId;
            return (
              <tr
                key={l.productId}
                className={`border-b border-zinc-100 last:border-0 ${
                  isFeatured ? 'bg-cyan-50/60' : ''
                }`}
              >
                <td className="max-w-[22rem] truncate py-2 pr-4 text-zinc-800">
                  {l.canonicalName}
                </td>
                <td className="mono py-2 pr-4 text-[10px] tracking-wider text-zinc-500 uppercase">
                  {l.category ?? '—'}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-700 tabular-nums">
                  {formatNumber(l.deals)}
                </td>
                <td className="mono py-2 pr-4 text-right text-emerald-700 tabular-nums">
                  {formatBRL(l.p10)}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-900 tabular-nums">
                  {formatBRL(l.median)}
                </td>
                <td className="mono py-2 pr-4 text-right text-zinc-500 tabular-nums">
                  {formatBRL(l.p90)}
                </td>
                <td className="py-2 pr-0 text-right">
                  {l.suspect ? (
                    <span
                      className="mono inline-flex items-center px-2 py-0.5 text-[10px] tracking-wider uppercase"
                      style={{
                        color: '#b91c1c',
                        background: 'rgba(220, 38, 38, 0.08)',
                      }}
                      title="Banda de preço implausível — provável colapso de variante ou extração ruim"
                    >
                      {l.spreadRatio}× suspect
                    </span>
                  ) : (
                    <span className="mono text-zinc-500 tabular-nums">
                      {l.spreadRatio}×
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
