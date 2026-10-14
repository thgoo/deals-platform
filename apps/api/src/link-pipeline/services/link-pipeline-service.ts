import type { CanonicalIdentifier } from '~/link-pipeline/identifiers/types';
import type { AffiliateRewriter } from '~/link-pipeline/rewriters/types';
import type { ExternalId, LinkPipelineResult } from '~/link-pipeline/types';
import type { Registry } from '~/link-pipeline/utils/create-registry';
import type { Logger } from '~/logger';
import { extractLinks } from '~/link-pipeline/extractors/link-extractor';
import { filterRelevantLinks } from '~/link-pipeline/extractors/link-filter';
import { extractExternalId } from '~/link-pipeline/identifiers/identifier-extractor';
import { SHORTENER_DOMAINS } from '~/link-pipeline/resolvers/constants';
import { expandUrl } from '~/link-pipeline/resolvers/url-resolver';
import { rewriteLink } from '~/link-pipeline/rewriters/rewriter';

export interface PipelineInput {
  text: string;
  knownLinks?: string[];
}

/**
 * Orchestrates the full link pipeline:
 *   raw text/links → extract → filter → expand (if shortener) → rewrite (affiliate)
 *                                                              → extract canonical id
 *
 * Returns the final affiliate-tagged URLs (to be stored and shown to users) and
 * the canonical external IDs extracted along the way (used by the catalog matcher).
 */
export default class LinkPipelineService {
  constructor(
    private readonly rewriters: Registry<AffiliateRewriter>,
    private readonly identifiers: Registry<CanonicalIdentifier>,
    private readonly logger: Logger,
  ) {}

  async process(input: PipelineInput): Promise<LinkPipelineResult> {
    const extracted = extractLinks(input.text, input.knownLinks);
    const relevant = filterRelevantLinks(extracted);

    if (relevant.length === 0) {
      return { finalLinks: [], allVersions: [], externalIds: [] };
    }

    this.logger.info('Processing links', { count: relevant.length });

    const results = await Promise.all(relevant.map(link => this.processOne(link)));

    const finalLinks = dedupePreservingOrder(results.map(r => r.final));
    const allVersions = dedupePreservingOrder(results.flatMap(r => r.versions));
    const externalIds = dedupeExternalIds(
      results.map(r => r.externalId).filter((id): id is ExternalId => id !== null),
    );

    return { finalLinks, allVersions, externalIds };
  }

  private async processOne(originalUrl: string): Promise<{
    final: string;
    versions: string[];
    externalId: ExternalId | null;
  }> {
    const versions: string[] = [originalUrl];

    const expanded = isShortener(originalUrl) ? await expandUrl(originalUrl) : originalUrl;
    if (expanded !== originalUrl) versions.push(expanded);

    const { final } = await rewriteLink(expanded, this.rewriters);
    if (final !== expanded) versions.push(final);

    // Try extracting the canonical id from the expanded URL first (most reliable),
    // falling back to the rewritten one. Rewritten URLs sometimes drop product paths.
    const externalId = extractExternalId(expanded, this.identifiers)
      ?? extractExternalId(final, this.identifiers);

    return { final, versions, externalId };
  }
}

function isShortener(url: string): boolean {
  return SHORTENER_DOMAINS.some(domain => url.includes(domain));
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function dedupeExternalIds(ids: ExternalId[]): ExternalId[] {
  const seen = new Set<string>();
  const out: ExternalId[] = [];
  for (const id of ids) {
    const key = `${id.source}:${id.externalId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}
