import BracketCard from './_components/bracket-card';
import DecisionsCard from './_components/decisions-card';
import {
  formatCompact,
  formatNumber,
  formatPercent,
} from './_components/format';
import HealthIndicator from './_components/health-indicator';
import HorizontalBars from './_components/horizontal-bars';
import MethodsDonut from './_components/methods-donut';
import RefreshTicker from './_components/refresh-ticker';
import SourcesTable from './_components/sources-table';
import StatCard from './_components/stat-card';
import TimeSeriesChart from './_components/time-series-chart';
import { dashboardApi } from './_lib/api';
import { EMPTY_HEARTBEAT, EMPTY_OVERVIEW } from './_lib/fallbacks';

export const dynamic = 'force-dynamic';

/**
 * Single-page intelligence dashboard. All eight backend queries fire in
 * parallel from the server component; the page is server-rendered with no
 * client-side data fetching beyond visx's animations.
 *
 * Layout: top status strip, then four logical sections (heartbeat, catalog
 * health, business volume, audit) stacked vertically.
 */
export default async function IntelligencePage() {
  // Per-endpoint fallback: a single timeout (e.g., backfill saturating MySQL)
  // would otherwise reject Promise.all and kill the whole page. Each fetch
  // now degrades to a typed empty value, the failed section shows zeros, and
  // the next polling refresh recovers without operator action.
  const reportFail = (name: string) => (err: unknown) => {
    console.warn(`[intelligence] ${name} failed:`, err);
  };
  const [
    heartbeat,
    overview,
    methods,
    decisions,
    topStores,
    topCategories,
    timeSeries,
    sources,
  ] = await Promise.all([
    dashboardApi.heartbeat().catch((e) => {
      reportFail('heartbeat')(e);
      return EMPTY_HEARTBEAT;
    }),
    dashboardApi.catalogOverview().catch((e) => {
      reportFail('overview')(e);
      return EMPTY_OVERVIEW;
    }),
    dashboardApi.matchMethods(7).catch((e) => {
      reportFail('matchMethods')(e);
      return [];
    }),
    dashboardApi.recentDecisions(100).catch((e) => {
      reportFail('decisions')(e);
      return [];
    }),
    dashboardApi.topStores(7, 8).catch((e) => {
      reportFail('topStores')(e);
      return [];
    }),
    dashboardApi.topCategories(7, 8).catch((e) => {
      reportFail('topCategories')(e);
      return [];
    }),
    dashboardApi.dealsTimeSeries(30).catch((e) => {
      reportFail('timeSeries')(e);
      return [];
    }),
    dashboardApi.sources().catch((e) => {
      reportFail('sources')(e);
      return [];
    }),
  ]);

  const renderedAt = new Date().toISOString();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      {/* ── Header strip ──────────────────────────────────────────── */}
      <header className="scanlines mb-10 flex flex-col gap-3 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="label-eyebrow">system status</span>
          <h1 className="text-3xl font-light tracking-tight text-zinc-900">
            intelligence
          </h1>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <HealthIndicator lastDealAt={heartbeat.lastDealAt} />
          <RefreshTicker
            renderedAt={renderedAt}
            sseUrl={`${process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'}/api/deals/stream`}
          />
        </div>
      </header>

      {/* ── Heartbeat row ─────────────────────────────────────────── */}
      <Section title="heartbeat" subtitle="pipeline volume & resolver yield">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            label="total deals"
            value={formatCompact(heartbeat.totalDeals)}
            sub={`since ${heartbeat.oldestDealAt ? new Date(heartbeat.oldestDealAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'forever'}`}
          />
          <StatCard
            label="last 1h"
            value={formatNumber(heartbeat.dealsLast1h)}
            sub="new deals"
          />
          <StatCard
            label="last 24h"
            value={formatNumber(heartbeat.dealsLast24h)}
            sub="new deals"
            accent
          />
          <StatCard
            label="last 7d"
            value={formatNumber(heartbeat.dealsLast7d)}
            sub="new deals"
          />
          <StatCard
            label="resolution rate"
            value={formatPercent(heartbeat.resolutionRate)}
            sub={`${formatNumber(heartbeat.resolvedDeals)} of ${formatNumber(heartbeat.resolvedDeals + heartbeat.unresolvedDeals)} resolvable`}
            hint={
              heartbeat.unresolvedDeals > 0
                ? `${formatNumber(heartbeat.unresolvedDeals)} pending`
                : 'all linked'
            }
          />
        </div>
      </Section>

      {/* ── Catalog health row ────────────────────────────────────── */}
      <Section title="catalog" subtitle="product graph health">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            label="products"
            value={formatNumber(overview.totalProducts)}
            sub="canonical entities"
          />
          <StatCard
            label="url mappings"
            value={formatNumber(overview.totalMappings)}
            sub="external id → product"
          />
          <StatCard
            label="cross-store"
            value={formatNumber(overview.productsWithMultiSource)}
            sub="products on 2+ sources"
            hint="good"
          />
          <StatCard
            label="single deal"
            value={formatNumber(overview.productsWithSingleDeal)}
            sub="seen only once"
            hint="watch"
          />
          <StatCard
            label="coupon-only"
            value={formatPercent(overview.couponOnlyShareLast30d / 100)}
            sub="of deals last 30d"
          />
        </div>
      </Section>

      {/* ── Volume + methods ──────────────────────────────────────── */}
      <Section title="resolver activity" subtitle="last 7 days">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <BracketCard className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="label-eyebrow">deals per day · 30d</span>
              <span className="mono text-[10px] text-zinc-400">
                {timeSeries.reduce((s, d) => s + d.count, 0)} total
              </span>
            </div>
            <TimeSeriesChart data={timeSeries} />
          </BracketCard>
          <BracketCard className="flex flex-col gap-4">
            <span className="label-eyebrow">match methods</span>
            <MethodsDonut stats={methods} />
          </BracketCard>
        </div>
      </Section>

      {/* ── Business signals ──────────────────────────────────────── */}
      <Section title="business" subtitle="where the volume goes · last 7d">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BracketCard className="flex flex-col gap-4">
            <span className="label-eyebrow">top stores</span>
            <HorizontalBars
              rows={topStores}
              color="#06b6d4"
              emptyText="no store data"
            />
          </BracketCard>
          <BracketCard className="flex flex-col gap-4">
            <span className="label-eyebrow">top categories</span>
            <HorizontalBars
              rows={topCategories}
              color="#c026d3"
              emptyText="no category data"
            />
          </BracketCard>
        </div>
      </Section>

      {/* ── Sources / identifier health ───────────────────────────── */}
      <Section
        title="sources"
        subtitle="url mappings by store · specific vs fallback"
      >
        <BracketCard>
          <SourcesTable sources={sources} />
        </BracketCard>
      </Section>

      {/* ── Audit · recent decisions ──────────────────────────────── */}
      <Section
        title="audit · recent decisions"
        subtitle={`latest ${decisions.length} resolutions · filter by method`}
      >
        <BracketCard>
          <DecisionsCard decisions={decisions} />
        </BracketCard>
      </Section>

      <footer className="mt-12 border-t border-zinc-200 pt-4 text-[10px] tracking-widest text-zinc-400 uppercase">
        operator console · v0
      </footer>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-medium tracking-widest text-zinc-700 uppercase">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-xs text-zinc-400">{`// ${subtitle}`}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
