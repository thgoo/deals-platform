import type { DealFilters, Item } from '../../types';

export function matchesDealFilters(deal: Item, { search, stores }: DealFilters): boolean {
  if (search) {
    const searchLower = search.toLowerCase();
    const text = [deal.product, deal.description, deal.text, deal.store]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!text.includes(searchLower)) return false;
  }

  if (stores.length > 0 && deal.store && !stores.includes(deal.store)) {
    return false;
  }

  return true;
}
