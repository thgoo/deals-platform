import { Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDateTime, formatRelativeTime } from '../utils';

type BadgeColor = 'blue' | 'green' | 'orange' | 'purple' | 'yellow' | 'default';

const colorMap: Record<BadgeColor, string> = {
  blue: 'bg-(--pixel-blue)',
  green: 'bg-(--pixel-green)',
  orange: 'bg-(--pixel-orange)',
  purple: 'bg-(--pixel-purple)',
  yellow: 'bg-(--pixel-yellow)',
  default: 'bg-background',
};

interface PixelBadgeProps {
  color?: BadgeColor;
  uppercase?: boolean;
  className?: string;
  children: ReactNode;
  title?: string;
  suppressHydrationWarning?: boolean;
}

export function PixelBadge({
  color = 'default',
  uppercase = true,
  className,
  children,
  title,
  suppressHydrationWarning,
}: PixelBadgeProps) {
  return (
    <div
      className={[
        'border-foreground text-foreground w-fit rounded border-2 px-2 pt-[5px] pb-1 text-xs font-black tracking-wider shadow-[2px_2px_0px_var(--pixel-dark)]',
        colorMap[color],
        uppercase && 'uppercase',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
      suppressHydrationWarning={suppressHydrationWarning}
    >
      {children}
    </div>
  );
}

interface StoreBadgeProps {
  store: string;
  className?: string;
}

export function StoreBadge({ store, className }: StoreBadgeProps) {
  return (
    <PixelBadge color="blue" className={className}>
      <Store className="relative -top-px inline h-4 w-4" /> {store}
    </PixelBadge>
  );
}

interface TimeBadgeProps {
  ts: string;
  className?: string;
}

export function TimeBadge({ ts, className }: TimeBadgeProps) {
  return (
    <PixelBadge
      color="default"
      uppercase={false}
      className={className}
      title={formatDateTime(ts)}
      suppressHydrationWarning
    >
      {formatRelativeTime(ts)}
    </PixelBadge>
  );
}
