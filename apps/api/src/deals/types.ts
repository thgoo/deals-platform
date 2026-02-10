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
  productKey: string;
  category: string | null;
  product: string | null;
  history: PriceHistoryItem[];
  stats: PriceHistoryStats;
}
