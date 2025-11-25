export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export interface Item {
  id: number;
  chat: string;
  chatId?: number;
  ts: string;
  text: string;
  product?: string;
  description?: string;
  store?: string;
  links: string[];
  price: number | null;
  coupons?: Coupon[];
  mediaType?: string;
  photoId?: string;
  localPath?: string;
}

export interface PaginatedResponse {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
  availableStores?: string[];
}

export const ANIMATION_TIMING = {
  OPEN: 0.3,
  CLOSE: 0.3,
  OPACITY: 0,
} as const;
