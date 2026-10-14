export interface DealFilters {
  search: string;
  stores: string[];
}

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
  productId?: string | null;
  category?: string | null;
}

export interface PaginatedResponse {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
  availableStores?: string[];
}

export interface PriceHistoryItem {
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
