import Link from 'next/link';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  buildHref: (page: number) => string;
}

/**
 * Numeric pagination following the HUD design: sharp corners, accent on the
 * active page, muted text for neighbours. Renders at most 7 visible slots to
 * avoid overflow on long page ranges.
 */
export default function Pagination({
  page,
  pages,
  total,
  buildHref,
}: PaginationProps) {
  if (pages <= 1) return null;

  const slots = buildSlots(page, pages);

  return (
    <div className="flex items-center justify-between">
      <span className="mono text-[11px] text-zinc-400">
        {total.toLocaleString('pt-BR')} products
      </span>

      <div className="flex items-center gap-1">
        <NavBtn href={buildHref(page - 1)} disabled={page <= 1} label="←" />

        {slots.map((slot, i) =>
          slot === '…' ? (
            <span
              key={`ellipsis-${i}`}
              className="mono px-2 text-xs text-zinc-400"
            >
              …
            </span>
          ) : (
            <Link
              key={slot}
              href={buildHref(slot as number)}
              className="mono flex h-7 min-w-[1.75rem] items-center justify-center px-1.5 text-xs transition-colors"
              style={
                slot === page
                  ? { background: 'var(--i-accent)', color: '#fff' }
                  : { color: 'var(--i-text-muted)' }
              }
            >
              {slot}
            </Link>
          ),
        )}

        <NavBtn href={buildHref(page + 1)} disabled={page >= pages} label="→" />
      </div>
    </div>
  );
}

function NavBtn({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="mono flex h-7 w-7 items-center justify-center text-xs text-zinc-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="mono flex h-7 w-7 items-center justify-center text-xs text-zinc-400 hover:text-cyan-700"
    >
      {label}
    </Link>
  );
}

/** Returns at most 7 slots: always includes first/last, surrounds current page. */
function buildSlots(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const around = new Set(
    [1, total, current, current - 1, current + 1].filter(
      (p) => p >= 1 && p <= total,
    ),
  );

  const sorted = [...around].sort((a, b) => a - b);
  const slots: (number | '…')[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i]!;
    if (prev !== undefined && cur - prev > 1) slots.push('…');
    slots.push(cur);
  }

  return slots;
}
