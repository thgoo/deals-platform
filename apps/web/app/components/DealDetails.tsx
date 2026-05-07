'use client';

import { DollarSign } from 'lucide-react';
import type { ElementType } from 'react';
import type { Item } from '../types';
import {
  formatDateTime,
  formatPrice,
  getDealImageSrc,
  removeUrls,
} from '../utils';
import CouponCopy from './CouponCopy';
import DealImage from './DealImage';
import { PixelBadge, StoreBadge } from './PixelBadge';

export interface PriceIndicatorDisplay {
  color: string;
  label: string;
  icon: ElementType<{ className?: string }> | null;
}

interface DealDetailsProps {
  deal: Item;
  priceIndicator: PriceIndicatorDisplay | null;
}

export default function DealDetails({
  deal,
  priceIndicator,
}: DealDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="pixel-dots border-foreground relative aspect-video w-full overflow-hidden rounded-lg border-3">
        <DealImage
          src={getDealImageSrc(deal.localPath)}
          alt={deal.product || deal.text}
          className="object-contain p-6"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {deal.store && <StoreBadge store={deal.store} />}
        <PixelBadge color="default" uppercase={false}>
          {formatDateTime(deal.ts)}
        </PixelBadge>
      </div>

      <h3 className="text-foreground text-2xl leading-tight font-black">
        {removeUrls(deal.product || deal.description || deal.text)}
      </h3>

      {deal.description && deal.product && (
        <p className="text-sm leading-relaxed text-(--pixel-gray)">
          {deal.description}
        </p>
      )}

      {deal.price && (
        <div className="border-foreground flex items-center gap-4 rounded-lg border-3 bg-(--pixel-yellow) p-4 shadow-[4px_4px_0px_var(--pixel-dark)]">
          <DollarSign className="text-foreground h-12 w-12" />
          <div className="flex-1">
            <div className="text-foreground/60 text-xs font-bold uppercase">
              Preço
            </div>
            <div className="text-foreground text-3xl font-black">
              {formatPrice(deal.price)}
            </div>
            {priceIndicator && (
              <div
                className={`mt-1 flex items-center gap-1 text-xs font-bold ${priceIndicator.color}`}
              >
                {priceIndicator.icon && (
                  <priceIndicator.icon className="h-3 w-3" />
                )}
                {priceIndicator.label}
              </div>
            )}
          </div>
        </div>
      )}

      {deal.coupons && deal.coupons.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-foreground text-xs font-black tracking-wider uppercase">
            Cupons Disponíveis
          </h4>
          <div className="space-y-2">
            {deal.coupons.map((coupon) => (
              <CouponCopy key={coupon.code} code={coupon.code} />
            ))}
          </div>
        </div>
      )}

      {deal.links && deal.links.length > 0 && (
        <div className="space-y-3">
          {deal.links.map((link, idx) => (
            <a
              key={idx}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="pixel-btn pixel-btn-pink block w-full rounded-lg text-center text-base"
            >
              {idx === 0 ? 'Ver promo' : `Opção ${idx + 1}`}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
