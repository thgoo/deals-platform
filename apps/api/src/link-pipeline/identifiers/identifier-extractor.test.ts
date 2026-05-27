import { describe, expect, test } from 'bun:test';
import { extractExternalId, extractExternalIds } from './identifier-extractor';
import { buildIdentifierRegistry } from './registry';

const registry = buildIdentifierRegistry();

describe('extractExternalId', () => {
  test('extracts ASIN from amazon /dp/ URL', () => {
    const result = extractExternalId('https://www.amazon.com.br/dp/B0CL5KNB9M', registry);
    expect(result).toEqual({ source: 'amazon', externalId: 'B0CL5KNB9M' });
  });

  test('extracts ASIN from amazon /gp/product/ URL', () => {
    const result = extractExternalId('https://www.amazon.com.br/gp/product/B0CL5KNB9M', registry);
    expect(result).toEqual({ source: 'amazon', externalId: 'B0CL5KNB9M' });
  });

  test('extracts MLB from /p/MLB... URL', () => {
    const result = extractExternalId(
      'https://www.mercadolivre.com.br/produto-name/p/MLB123456789',
      registry,
    );
    expect(result).toEqual({ source: 'mercadolivre', externalId: 'MLB123456789' });
  });

  test('extracts MLB from MLB-... URL', () => {
    const result = extractExternalId(
      'https://www.mercadolivre.com.br/MLB-987654321-product-name',
      registry,
    );
    expect(result).toEqual({ source: 'mercadolivre', externalId: 'MLB987654321' });
  });

  test('extracts Kabum product id', () => {
    const result = extractExternalId('https://www.kabum.com.br/produto/123456/some-product', registry);
    expect(result).toEqual({ source: 'kabum', externalId: '123456' });
  });

  test('extracts Magalu product code', () => {
    const result = extractExternalId(
      'https://www.magazineluiza.com.br/produto-name/p/abc123/category/sub',
      registry,
    );
    expect(result).toEqual({ source: 'magalu', externalId: 'abc123' });
  });

  test('extracts AliExpress item id', () => {
    const result = extractExternalId('https://www.aliexpress.com/item/1005006123456789.html', registry);
    expect(result).toEqual({ source: 'aliexpress', externalId: '1005006123456789' });
  });

  test('extracts Shopee shopId.itemId from -i. URL', () => {
    const result = extractExternalId('https://shopee.com.br/produto-name-i.123456.7890123', registry);
    expect(result).toEqual({ source: 'shopee', externalId: '123456.7890123' });
  });

  test('host fallback captures unknown stores using hostname + pathname', () => {
    const result = extractExternalId('https://www.casasbahia.com.br/produto/x-123', registry);
    expect(result).toEqual({ source: 'casasbahia.com.br', externalId: 'produto/x-123' });
  });

  test('host fallback lowercases the pathname and strips www.', () => {
    const result = extractExternalId('https://WWW.SomeStore.com.br/Produto/ABC', registry);
    expect(result).toEqual({ source: 'somestore.com.br', externalId: 'produto/abc' });
  });

  test('host fallback ignores URL shorteners (path is opaque)', () => {
    expect(extractExternalId('https://amzn.to/3abc', registry)).toBeNull();
    expect(extractExternalId('https://tidd.ly/xyz', registry)).toBeNull();
    expect(extractExternalId('https://go.promozone.ai/abc', registry)).toBeNull();
  });

  test('host fallback ignores affiliate network endpoints', () => {
    expect(extractExternalId('https://www.awin1.com/cread.php?awinmid=1234', registry)).toBeNull();
  });

  test('host fallback returns null for homepage / empty path', () => {
    expect(extractExternalId('https://unknownshop.com', registry)).toBeNull();
    expect(extractExternalId('https://unknownshop.com/', registry)).toBeNull();
  });

  test('specific identifier still wins over the host fallback', () => {
    const result = extractExternalId('https://www.amazon.com.br/dp/B0CL5KNB9M', registry);
    // Source is 'amazon', not 'amazon.com.br' — Amazon identifier claimed first.
    expect(result).toEqual({ source: 'amazon', externalId: 'B0CL5KNB9M' });
  });

  test('returns null when identifier claims URL but cannot extract id', () => {
    // amazon.com.br URL without /dp/ pattern — Amazon identifier claims it but
    // fails to extract an ASIN. We do NOT fall through to host fallback (the
    // claim is exclusive).
    const result = extractExternalId('https://www.amazon.com.br/promotions/page', registry);
    expect(result).toBeNull();
  });

  test('extracts Pichau slug as canonical id (full pathname)', () => {
    const result = extractExternalId(
      'https://www.pichau.com.br/water-cooler-corsair-nautilus-360-rs-argb-360mm-preto-cw-9060093-ww',
      registry,
    );
    expect(result).toEqual({
      source: 'pichau',
      externalId: 'water-cooler-corsair-nautilus-360-rs-argb-360mm-preto-cw-9060093-ww',
    });
  });

  test('Pichau slug is case-insensitive', () => {
    const result = extractExternalId(
      'https://www.pichau.com.br/Water-Cooler-Corsair-Nautilus-CW-9060093-WW',
      registry,
    );
    expect(result?.externalId).toBe('water-cooler-corsair-nautilus-cw-9060093-ww');
  });

  test('returns null for Pichau homepage (no slug)', () => {
    const result = extractExternalId('https://www.pichau.com.br/', registry);
    expect(result).toBeNull();
  });
});

describe('extractExternalIds', () => {
  test('extracts ids from a list of URLs', () => {
    const ids = extractExternalIds([
      'https://www.amazon.com.br/dp/B0CL5KNB9M',
      'https://www.kabum.com.br/produto/12345/x',
    ], registry);
    expect(ids).toEqual([
      { source: 'amazon', externalId: 'B0CL5KNB9M' },
      { source: 'kabum', externalId: '12345' },
    ]);
  });

  test('deduplicates by source+id when the same product appears multiple times', () => {
    const ids = extractExternalIds([
      'https://www.amazon.com.br/dp/B0CL5KNB9M',
      'https://www.amazon.com.br/different-slug/dp/B0CL5KNB9M/ref=xyz',
    ], registry);
    expect(ids).toEqual([{ source: 'amazon', externalId: 'B0CL5KNB9M' }]);
  });

  test('captures unknown stores via host fallback alongside known ones', () => {
    const ids = extractExternalIds([
      'https://unknownshop.com/p/123',
      'https://www.amazon.com.br/dp/B0CL5KNB9M',
    ], registry);
    expect(ids).toEqual([
      { source: 'unknownshop.com', externalId: 'p/123' },
      { source: 'amazon', externalId: 'B0CL5KNB9M' },
    ]);
  });

  test('skips shorteners but keeps everything else', () => {
    const ids = extractExternalIds([
      'https://amzn.to/abc',                              // shortener — skipped
      'https://www.amazon.com.br/dp/B0CL5KNB9M',          // known store
      'https://www.casasbahia.com.br/produto/x',          // unknown store — fallback
    ], registry);
    expect(ids).toEqual([
      { source: 'amazon', externalId: 'B0CL5KNB9M' },
      { source: 'casasbahia.com.br', externalId: 'produto/x' },
    ]);
  });

  test('returns empty array for empty input', () => {
    expect(extractExternalIds([], registry)).toEqual([]);
  });

  test('preserves first-seen order', () => {
    const ids = extractExternalIds([
      'https://www.kabum.com.br/produto/12345/x',
      'https://www.amazon.com.br/dp/B0CL5KNB9M',
    ], registry);
    expect(ids.map(i => i.source)).toEqual(['kabum', 'amazon']);
  });
});
