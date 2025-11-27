import React from 'react';
import { Item, PaginatedResponse } from '../../types';

/**
 * Props for the useInfiniteDeals hook
 */
export interface UseInfiniteDealsProps {
  /**
   * Initial data for the hook, typically from SSR
   */
  initialData?: PaginatedResponse | null;

  /**
   * Search text to filter deals
   */
  search?: string;

  /**
   * Filter by deals with coupons
   */
  hasCoupon?: boolean | null;

  /**
   * Filter by specific stores
   */
  stores?: string[];
}

/**
 * Return type for the useInfiniteDeals hook
 */
export interface UseInfiniteDealsReturn {
  /**
   * Array of deal items from all loaded pages
   */
  items: Item[];

  /**
   * Whether there are more items to load
   */
  hasMore: boolean;

  /**
   * Whether more items are currently being loaded
   */
  isLoadingMore: boolean;

  /**
   * Whether the initial data is being loaded
   */
  isInitialLoading: boolean;

  /**
   * Whether data is currently being validated/refreshed
   */
  isValidating: boolean;

  /**
   * Whether filtering is in progress
   */
  isFilteringInProgress: boolean;

  /**
   * Ref to attach to the element that triggers loading more items
   */
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

/**
 * Filter criteria for deals
 */
export interface FilterCriteria {
  /**
   * Search text to match against deal content
   */
  search?: string;

  /**
   * Filter by deals with coupons
   */
  hasCoupon?: boolean | null;

  /**
   * Filter by specific stores
   */
  stores?: string[];
}
