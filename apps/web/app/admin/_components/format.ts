// Pure formatting helpers for the dashboard. Locale fixed to en-US for
// dense, predictable numerics — the operator-facing UI is in English.

const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const FULL = new Intl.NumberFormat('en-US');

// Prices are stored in cents — the only BRL-locale formatting in the dashboard.
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatNumber(n: number): string {
  return FULL.format(n);
}

export function formatCompact(n: number): string {
  return COMPACT.format(n);
}

export function formatPercent(share: number, decimals = 1): string {
  return `${(share * 100).toFixed(decimals)}%`;
}

/** Format a price given in cents as Brazilian currency, e.g. 284900 → R$ 2.849,00. */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 'never';
  const diff = Date.now() - d;
  if (diff < 0) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Stable color per matching method — used across the donut and decisions table. */
export const METHOD_COLORS: Record<string, string> = {
  url_anchor: '#0e7490', // cyan-700  — cheapest, ideal
  embedding_only: '#06b6d4', // cyan-500  — automatic match
  llm_judge: '#c026d3', // fuchsia   — needed reasoning
  created_new: '#ea580c', // orange    — fresh product
  skipped: '#a1a1aa', // zinc      — no resolution attempted
};

/** Human label for the same key — fallback to the raw key. */
export const METHOD_LABELS: Record<string, string> = {
  url_anchor: 'url anchor',
  embedding_only: 'embedding',
  llm_judge: 'llm judge',
  created_new: 'new product',
  skipped: 'skipped',
};

export function methodLabel(m: string): string {
  return METHOD_LABELS[m] ?? m;
}

export function methodColor(m: string): string {
  return METHOD_COLORS[m] ?? '#71717a';
}
