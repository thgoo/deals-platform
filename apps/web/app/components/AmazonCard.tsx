import type { Item } from '../types';
import { getDealImageSrc, removeUrls } from '../utils';
import BaseCard from './BaseCard';
import CouponCopy from './CouponCopy';
import DealImage from './DealImage';
import { TimeBadge } from './PixelBadge';

interface AmazonCardProps {
  item: Item;
  primaryLink: string;
}

export default function AmazonCard({ item, primaryLink }: AmazonCardProps) {
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
          <TimeBadge ts={item.ts} className="absolute top-2 right-2" />
        </>
      }
    >
      <h3 className="text-foreground text-sm leading-tight font-black">
        {removeUrls(displayText)}
      </h3>

      {item.description && item.product && (
        <p className="text-xs leading-relaxed text-(--pixel-gray)">
          {item.description}
        </p>
      )}

      <div className="mt-auto space-y-3">
        {item.coupons && item.coupons.length > 0 && (
          <CouponCopy code={item.coupons[0]!.code} />
        )}
        <a
          href={primaryLink}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="pixel-btn pixel-btn-pink block w-full rounded-lg text-center text-base"
        >
          Ver na Amazon
        </a>
      </div>
    </BaseCard>
  );
}
