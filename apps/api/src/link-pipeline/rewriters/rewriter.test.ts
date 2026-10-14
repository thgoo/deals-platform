import { describe, expect, test } from 'bun:test';
import type { AffiliateRewriter } from './types';
import { createRegistry } from '~/link-pipeline/utils/create-registry';
import { rewriteLink } from './rewriter';

class StubRewriter implements AffiliateRewriter {
  constructor(
    readonly name: string,
    private readonly handles: (url: string) => boolean,
    private readonly result: string | null | Error,
  ) {}

  canHandle(url: string): boolean {
    return this.handles(url);
  }

  async rewrite(): Promise<string | null> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe('rewriteLink', () => {
  test('uses the first rewriter that claims the URL', async () => {
    const registry = createRegistry<AffiliateRewriter>();
    registry.register(new StubRewriter('a', u => u.includes('amazon'), 'https://amazon.com/?tag=mine'));
    registry.register(new StubRewriter('b', () => true, 'https://wrong.com'));

    const result = await rewriteLink('https://amazon.com/dp/X', registry);
    expect(result).toEqual({ final: 'https://amazon.com/?tag=mine', rewritten: true });
  });

  test('falls back to cleaning when no rewriter claims the URL', async () => {
    const registry = createRegistry<AffiliateRewriter>();
    registry.register(new StubRewriter('a', () => false, 'irrelevant'));

    const result = await rewriteLink('https://unknown.com/p?utm_source=x#frag', registry);
    expect(result).toEqual({ final: 'https://unknown.com/p', rewritten: false });
  });

  test('falls back to cleaning when the matching rewriter returns null', async () => {
    const registry = createRegistry<AffiliateRewriter>();
    registry.register(new StubRewriter('a', () => true, null));

    const result = await rewriteLink('https://amazon.com/dp/X?ref=foo', registry);
    expect(result).toEqual({ final: 'https://amazon.com/dp/X', rewritten: false });
  });

  test('falls back to cleaning when the matching rewriter throws', async () => {
    const registry = createRegistry<AffiliateRewriter>();
    registry.register(new StubRewriter('a', () => true, new Error('api down')));

    const result = await rewriteLink('https://amazon.com/dp/X?ref=foo', registry);
    expect(result).toEqual({ final: 'https://amazon.com/dp/X', rewritten: false });
  });
});
