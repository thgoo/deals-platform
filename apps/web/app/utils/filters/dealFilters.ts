'use client';

import { FilterCriteria } from '../../hooks/useInfiniteDeals/types';
import { Item } from '../../types';

/**
 * Checks if a deal matches the specified filter criteria
 *
 * @param deal - The deal to check
 * @param filters - Filter criteria to match against
 * @returns boolean indicating if the deal matches all filters
 */
export function matchesDealFilters(
  deal: Item,
  filters: FilterCriteria,
): boolean {
  const { search = '', hasCoupon = null, stores = [] } = filters;

  // Check search filter
  if (search) {
    const searchLower = search.toLowerCase();
    const textToSearch = [deal.product, deal.description, deal.text, deal.store]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!textToSearch.includes(searchLower)) {
      return false;
    }
  }

  // Check coupon filter
  if (hasCoupon !== null) {
    const hasCoupons = deal.coupons && deal.coupons.length > 0;
    if ((hasCoupon && !hasCoupons) || (!hasCoupon && hasCoupons)) {
      return false;
    }
  }

  // Check store filter
  if (stores.length > 0 && deal.store) {
    if (!stores.includes(deal.store)) {
      return false;
    }
  }

  // Deal matches all filters
  return true;
}
