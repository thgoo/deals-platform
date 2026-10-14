import type { DealDto } from '@bargah/shared';
import type { Deal } from '~/db/schemas/deals';
import { toIsoString } from '~/utils/dates';

/** A deal row as the public API sends it (same JSON as before: dates as ISO strings). */
export function toDealDto(deal: Deal): DealDto {
  return {
    id: deal.id,
    messageId: deal.messageId,
    chat: deal.chat,
    chatId: deal.chatId,
    ts: toIsoString(deal.ts),
    text: deal.text,
    links: deal.links,
    price: deal.price,
    coupons: deal.coupons,
    store: deal.store,
    description: deal.description,
    product: deal.product,
    category: deal.category,
    mediaType: deal.mediaType,
    photoId: deal.photoId,
    localPath: deal.localPath,
    productId: deal.productId,
    createdAt: toIsoString(deal.createdAt),
  };
}
