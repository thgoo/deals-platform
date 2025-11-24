// ============================================================================
// MEDIA TYPES
// ============================================================================

import type { Api } from 'telegram';

export interface PhotoMedia {
  type: 'photo';
  photo_id: Api.long;
}

export interface DocumentMedia {
  type: 'document';
  mime?: string;
  doc_id?: Api.long;
}

export interface WebPageMedia {
  type: 'webpage';
  url?: string;
  site_name?: string | null;
  title?: string | null;
  description?: string | null;
  has_photo?: boolean;
}

export type Media = PhotoMedia | DocumentMedia | WebPageMedia;

// ============================================================================
// PAYLOAD TYPES
// ============================================================================

export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export interface DealPayload {
  message_id: number;
  chat: string;
  chat_id: string;
  ts: string;
  text: string;
  links: string[];
  price?: number;
  deal_type?: 'product' | 'coupon' | 'info';
  coupons?: Coupon[];
  media?: Media;
  store?: string | null;
  description?: string | null;
  product?: string | null;
}
