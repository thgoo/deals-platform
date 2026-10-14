import type { ReactNode } from 'react';
import BracketCard from './bracket-card';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}

/**
 * One KPI box: small uppercase eyebrow + big mono number + optional sublabel.
 * Designed to live in a grid row of 3-5 across.
 */
export default function StatCard({
  label,
  value,
  sub,
  hint,
  accent = false,
}: StatCardProps) {
  return (
    <BracketCard accent={accent} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="label-eyebrow">{label}</span>
        {hint ? (
          <span className="text-[10px] tracking-wider text-zinc-400 uppercase">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mono text-3xl leading-none font-light tracking-tight text-zinc-900">
        {value}
      </div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
    </BracketCard>
  );
}
