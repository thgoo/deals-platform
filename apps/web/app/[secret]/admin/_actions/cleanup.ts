'use server';

import { revalidatePath } from 'next/cache';
import type { ProductAnalysis } from '../_lib/types';

// Server actions: the dashboard secret stays on the server. The client review
// modal calls these over the framework RPC boundary — the secret and the
// internal backend URL never reach the browser.

const BACKEND = process.env.INTERNAL_BACKEND_URL ?? 'http://localhost:8000';
const SECRET = process.env.DASHBOARD_SECRET ?? '';

export async function analyzeProduct(
  productId: string,
): Promise<ProductAnalysis> {
  const res = await fetch(
    `${BACKEND}/api/dashboard/catalog/products/${encodeURIComponent(productId)}/analyze`,
    { headers: { 'X-Dashboard-Secret': SECRET }, cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`analyze failed: ${res.status}`);
  }
  return res.json() as Promise<ProductAnalysis>;
}

export async function cleanProduct(
  productId: string,
  dealIds: number[],
): Promise<{ unlinked: number }> {
  const res = await fetch(
    `${BACKEND}/api/dashboard/catalog/products/${encodeURIComponent(productId)}/clean`,
    {
      method: 'POST',
      headers: {
        'X-Dashboard-Secret': SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dealIds }),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`clean failed: ${res.status}`);
  }
  const result = (await res.json()) as { unlinked: number };

  // Refresh the server-rendered anomaly queue so the cleaned product's band
  // recomputes on the next view.
  revalidatePath('/[secret]/admin', 'page');
  return result;
}
