// Public deal API (/api/deals/*) response shapes, as they arrive over JSON
// (dates are ISO strings).

export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export interface DealDto {
  id: number;
  messageId: number;
  chat: string;
  chatId: string | null;
  ts: string;
  text: string;
  links: string[];
  /** Price in cents. */
  price: number | null;
  coupons: Coupon[] | null;
  store: string | null;
  description: string | null;
  product: string | null;
  category: string | null;
  mediaType: string | null;
  photoId: string | null;
  localPath: string | null;
  productId: string | null;
  createdAt: string;
}

export interface DealsPageDto {
  items: DealDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StoresResponse {
  stores: string[];
}

export interface PriceHistoryItem {
  /** Price in cents. */
  price: number;
  store: string | null;
  ts: string;
  dealId: number;
}

export interface PriceHistoryStats {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  totalDeals: number;
}

export interface PriceHistoryResponse {
  productId: string;
  canonicalName: string | null;
  category: string | null;
  history: PriceHistoryItem[];
  stats: PriceHistoryStats;
}

/** Server-sent events on GET /api/deals/stream. */
export interface ImageUpdatedEvent {
  id: number;
  localPath: string | null;
}
