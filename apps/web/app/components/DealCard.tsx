'use client';

import { Tag } from 'lucide-react';
import type { Item } from '../types';
import { formatPrice, getDealImageSrc, removeUrls } from '../utils';
import BaseCard from './BaseCard';
import DealImage from './DealImage';
import { PixelBadge, StoreBadge, TimeBadge } from './PixelBadge';

interface DealCardProps {
  item: Item;
  onClick: (item: Item) => void;
}

export default function DealCard({ item, onClick }: DealCardProps) {
  const displayText = item.product || item.description || item.text;

  return (
    <BaseCard
      imageSlot={
        <>
          <DealImage
            src={getDealImageSrc(item.localPath)}
            alt={displayText}
            className="object-contain transition-transform duration-300"
          />
          {item.store && (
            <StoreBadge
              store={item.store}
              className="absolute bottom-2 left-2"
            />
          )}
          <TimeBadge ts={item.ts} className="absolute top-2 right-2" />
        </>
      }
    >
      <h3 className="text-foreground line-clamp-2 text-sm leading-tight font-black">
        {removeUrls(displayText)}
      </h3>

      <div className="mt-auto space-y-3">
        {item.coupons && item.coupons.length > 0 && (
          <PixelBadge color="green">
            <Tag className="inline h-3 w-3" /> {item.coupons.length}{' '}
            {item.coupons.length === 1 ? 'cupom' : 'cupons'}
          </PixelBadge>
        )}

        {item.price && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-(--pixel-pink)">
              {formatPrice(item.price)}
            </span>
          </div>
        )}

        <button
          className="pixel-btn pixel-btn-pink w-full rounded-lg text-center text-xs"
          onClick={() => onClick(item)}
        >
          Ver detalhes
        </button>
      </div>
    </BaseCard>
  );
}
