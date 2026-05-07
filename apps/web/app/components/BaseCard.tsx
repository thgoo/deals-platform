import type { ReactNode } from 'react';

interface BaseCardProps {
  imageSlot: ReactNode;
  children: ReactNode;
}

export default function BaseCard({ imageSlot, children }: BaseCardProps) {
  return (
    <div className="pixel-slide-in h-full transition-all duration-300">
      <div className="pixel-card group relative flex h-full w-full flex-col overflow-hidden rounded-lg text-left">
        <div className="pixel-dots border-foreground relative aspect-square w-full overflow-hidden border-b-3">
          {imageSlot}
        </div>
        <div className="flex flex-1 flex-col space-y-3 p-4">{children}</div>
      </div>
    </div>
  );
}
