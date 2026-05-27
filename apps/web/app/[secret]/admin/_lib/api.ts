import 'server-only';
import type {
  CatalogOverview,
  DailyCount,
  DuplicateSuspect,
  HeartbeatStats,
  MatchMethodStat,
  NamedCount,
  RecentDecision,
  SourceStat,
} from './types';

// Server-only fetch helpers. `INTERNAL_BACKEND_URL` and `DASHBOARD_SECRET`
// are private env vars (no NEXT_PUBLIC_ prefix) — they never reach the
// browser. Each call uses `no-store` so the dashboard always reflects the
// freshest data without manual cache invalidation.

const BACKEND = process.env.INTERNAL_BACKEND_URL ?? 'http://localhost:8000';
const SECRET = process.env.DASHBOARD_SECRET ?? '';

// Per-call timeout. Generous on purpose: the backend has its own SWR cache so
// warm hits are sub-100ms — anything taking longer means the backend is doing
// real work (cold-start compute, GC pause, MySQL hiccup). Failing fast at 8s
// caused sections to blank intermittently; 20s only fails on genuine hangs.
const FETCH_TIMEOUT_MS = 20_000;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}/api/dashboard${path}`, {
    headers: { 'X-Dashboard-Secret': SECRET },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Dashboard API ${path} returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const dashboardApi = {
  heartbeat: () => get<HeartbeatStats>('/heartbeat'),

  catalogOverview: () => get<CatalogOverview>('/catalog/overview'),
  matchMethods: (days = 7) =>
    get<MatchMethodStat[]>(`/catalog/match-methods?days=${days}`),
  duplicateSuspects: (threshold = 0.85, limit = 20) =>
    get<DuplicateSuspect[]>(
      `/catalog/duplicate-suspects?threshold=${threshold}&limit=${limit}`,
    ),
  recentDecisions: (limit = 50) =>
    get<RecentDecision[]>(`/catalog/decisions?limit=${limit}`),
  sources: () => get<SourceStat[]>('/catalog/sources'),

  topStores: (days = 7, limit = 10) =>
    get<NamedCount[]>(`/business/top-stores?days=${days}&limit=${limit}`),
  topCategories: (days = 7, limit = 10) =>
    get<NamedCount[]>(`/business/top-categories?days=${days}&limit=${limit}`),
  dealsTimeSeries: (days = 30) =>
    get<DailyCount[]>(`/business/deals-timeseries?days=${days}`),
};
