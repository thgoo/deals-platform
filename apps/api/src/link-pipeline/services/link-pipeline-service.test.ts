import { beforeEach, describe, expect, test } from 'bun:test';
import type { AffiliateRewriter } from '~/link-pipeline/rewriters/types';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { createRegistry } from '~/link-pipeline/utils/create-registry';
import LinkPipelineService from './link-pipeline-service';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

class StubRewriter implements AffiliateRewriter {
  constructor(
    readonly name: string,
    private readonly handles: (url: string) => boolean,
    private readonly transform: (url: string) => string | null,
  ) {}

  canHandle(url: string): boolean {
    return this.handles(url);
  }

  async rewrite(url: string): Promise<string | null> {
    return this.transform(url);
  }
}

describe('LinkPipelineService', () => {
  let rewriters = createRegistry<AffiliateRewriter>();
  const identifiers = buildIdentifierRegistry();
  let service: LinkPipelineService;

  beforeEach(() => {
    rewriters = createRegistry<AffiliateRewriter>();
    service = new LinkPipelineService(rewriters, identifiers, silentLogger);
  });

  test('returns empty result when input has no links', async () => {
    const result = await service.process({ text: 'just text, no links' });
    expect(result.finalLinks).toEqual([]);
    expect(result.externalIds).toEqual([]);
  });

  test('drops irrelevant links (t.me, canal, social)', async () => {
    rewriters.register(new StubRewriter(
      'amazon',
      u => u.includes('amazon'),
      u => u.replace(/\?.*$/, '') + '?tag=mine',
    ));

    const result = await service.process({
      text: 'https://t.me/canal and https://www.amazon.com.br/dp/B0CL5KNB9M',
    });

    expect(result.finalLinks).toHaveLength(1);
    expect(result.finalLinks[0]).toContain('tag=mine');
  });

  test('applies the matching rewriter to a known store URL', async () => {
    rewriters.register(new StubRewriter(
      'amazon',
      u => u.includes('amazon'),
      () => 'https://www.amazon.com.br/dp/B0CL5KNB9M?tag=mine',
    ));

    const result = await service.process({
      text: 'check https://www.amazon.com.br/dp/B0CL5KNB9M',
    });

    expect(result.finalLinks).toEqual(['https://www.amazon.com.br/dp/B0CL5KNB9M?tag=mine']);
  });

  test('falls back to cleaning when no rewriter matches', async () => {
    const result = await service.process({
      text: 'https://unknownshop.com/produto/123?utm_source=fb#section',
    });
    expect(result.finalLinks).toEqual(['https://unknownshop.com/produto/123']);
  });

  test('extracts the canonical external id', async () => {
    rewriters.register(new StubRewriter(
      'amazon',
      u => u.includes('amazon'),
      () => 'https://www.amazon.com.br/dp/B0CL5KNB9M?tag=mine',
    ));

    const result = await service.process({
      text: 'https://www.amazon.com.br/some-name/dp/B0CL5KNB9M/ref=foo',
    });

    expect(result.externalIds).toEqual([{ source: 'amazon', externalId: 'B0CL5KNB9M' }]);
  });

  test('deduplicates external ids when same product appears multiple times', async () => {
    const result = await service.process({
      text: 'https://www.amazon.com.br/dp/B0CL5KNB9M and https://www.amazon.com.br/dp/B0CL5KNB9M',
    });
    expect(result.externalIds).toEqual([{ source: 'amazon', externalId: 'B0CL5KNB9M' }]);
  });

  test('deduplicates final links', async () => {
    const result = await service.process({
      text: 'https://shop.com/p/1 and https://shop.com/p/1',
    });
    expect(result.finalLinks).toEqual(['https://shop.com/p/1']);
  });

  test('preserves order of multiple distinct links', async () => {
    const result = await service.process({
      text: 'https://shop.com/p/1 then https://shop.com/p/2',
    });
    expect(result.finalLinks).toEqual(['https://shop.com/p/1', 'https://shop.com/p/2']);
  });

  test('merges links from text and knownLinks', async () => {
    const result = await service.process({
      text: 'see https://shop.com/p/1',
      knownLinks: ['https://shop.com/p/2'],
    });
    expect(result.finalLinks).toEqual(['https://shop.com/p/1', 'https://shop.com/p/2']);
  });

  test('falls back to cleaning when rewriter throws', async () => {
    rewriters.register(new StubRewriter(
      'amazon',
      u => u.includes('amazon'),
      () => { throw new Error('boom'); },
    ));

    const result = await service.process({
      text: 'https://www.amazon.com.br/dp/B0CL5KNB9M?ref=x',
    });
    expect(result.finalLinks).toEqual(['https://www.amazon.com.br/dp/B0CL5KNB9M']);
    // ID extraction still works from the expanded URL (no shortener here, so it's the original)
    expect(result.externalIds).toEqual([{ source: 'amazon', externalId: 'B0CL5KNB9M' }]);
  });

  test('returns multiple external ids when links point to different stores', async () => {
    const result = await service.process({
      text: 'https://www.amazon.com.br/dp/B0CL5KNB9M and https://www.kabum.com.br/produto/12345/x',
    });
    expect(result.externalIds).toEqual([
      { source: 'amazon', externalId: 'B0CL5KNB9M' },
      { source: 'kabum', externalId: '12345' },
    ]);
  });
});
