/**
 * Extractor Service Client
 * Calls the AI-powered extractor service
 */

import type { Coupon } from './types';

interface ExtractorRequest {
  text: string;
  chat: string;
  messageId: number;
  links: string[];
}

interface ExtractorResponse {
  text: string;
  description: string | null;
  product: string | null;
  store: string | null;
  price: number | null;
  coupons: Coupon[];
}

export interface ExtractionResult {
  price: number | null;
  coupons: Coupon[];
  product: string | null;
  store: string | null;
  description: string | null;
}

export async function extractWithService(
  serviceUrl: string,
  text: string,
  chat: string,
  messageId: number,
  links: string[],
): Promise<ExtractionResult> {
  const payload: ExtractorRequest = {
    text,
    chat,
    messageId,
    links,
  };

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Extractor service error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as ExtractorResponse;

  return {
    price: data.price,
    coupons: data.coupons || [],
    product: data.product,
    store: data.store,
    description: data.description,
  };
}
