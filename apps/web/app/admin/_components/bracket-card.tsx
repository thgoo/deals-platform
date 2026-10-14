import type { ReactNode } from 'react';

interface BracketCardProps {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}

/**
 * Card with L-shaped HUD brackets at each corner — the visual signature of the
 * dashboard. The bottom-left and bottom-right brackets are rendered as inner
 * spans because CSS only gives us two pseudo-elements per node.
 */
export default function BracketCard({
  children,
  className = '',
  accent = false,
}: BracketCardProps) {
  return (
    <div
      className={`bracket-card ${accent ? 'bracket-card-accent' : ''} ${className}`}
    >
      <span className="bracket-bl" aria-hidden />
      <span className="bracket-br" aria-hidden />
      {children}
    </div>
  );
}
