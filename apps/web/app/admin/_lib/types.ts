import type { TimelineEvent } from '@bargah/shared';

// Response shapes of the api's /api/dashboard/* live in @bargah/shared, next to
// the api code that produces them. Only UI-derived types are defined here.
export type {
  AnalyzedDeal,
  Anomaly,
  CatalogOverview,
  DailyCount,
  DealVerdict,
  ExplorerProduct,
  ExplorerSortField,
  HeartbeatStats,
  MatchMethodStat,
  NamedCount,
  PriceHistory,
  PriceLeader,
  PricePoint,
  ProductAnalysis,
  ProductDetail,
  ProductPage,
  ProductSource,
  RecentDecision,
  SortOrder,
  SourceStat,
  TimelineEvent,
} from '@bargah/shared';

export type TimelineMarkerKind =
  'debut' | 'new-store' | 'drop' | 'rise' | 'normal';

export interface TimelineRichEvent {
  event: TimelineEvent;
  narrative: string;
  context: string | null;
  marker: TimelineMarkerKind;
  isLast: boolean;
  pctChange: number | null;
  store: string | null;
}
