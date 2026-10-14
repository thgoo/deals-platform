'use server';

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
  // The modal refreshes the page once on close (router.refresh), so we don't
  // revalidate here — that would re-run the heavy dashboard queries inline and
  // block the action's return.
  return res.json() as Promise<{ unlinked: number }>;
}

export async function updateDeal(
  dealId: number,
  fields: { price?: number; product?: string },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND}/api/dashboard/deals/${dealId}`, {
    method: 'PATCH',
    headers: {
      'X-Dashboard-Secret': SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`update deal failed: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function deleteDeal(
  dealId: number,
): Promise<{ ok: boolean; error?: string }> {
  // Returns the error instead of throwing — Next masks thrown server-action
  // errors in production, so we surface the real cause to the modal.
  try {
    const res = await fetch(`${BACKEND}/api/dashboard/deals/${dealId}`, {
      method: 'DELETE',
      headers: { 'X-Dashboard-Secret': SECRET },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: `core-api ${res.status} ${body.slice(0, 200)}`,
      };
    }
    return (await res.json()) as { ok: boolean };
  } catch (e) {
    return {
      ok: false,
      error: `request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function updateProductName(
  productId: string,
  canonicalName: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${BACKEND}/api/dashboard/catalog/products/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: {
        'X-Dashboard-Secret': SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ canonicalName }),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`rename failed: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

/**
 * Invalidates the heavy dashboard caches on the backend. Called once when the
 * review modal closes, just before router.refresh, so the queue/panels
 * recompute fresh — without slowing the inline edits while the modal is open.
 */
export async function refreshDashboardCaches(): Promise<void> {
  await fetch(`${BACKEND}/api/dashboard/cache/invalidate`, {
    method: 'POST',
    headers: { 'X-Dashboard-Secret': SECRET },
    cache: 'no-store',
  });
}
