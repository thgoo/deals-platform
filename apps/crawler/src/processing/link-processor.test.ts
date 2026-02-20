import { describe, expect, it } from 'bun:test';
import { linkProcessor } from './link-processor';

describe('filterRelevantLinks', () => {
  it('passes through a regular product link', () => {
    const links = ['https://www.amazon.com.br/dp/B09ABC12345'];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual(links);
  });

  it('rejects t.me links', () => {
    const links = ['https://t.me/somechannel', 'https://www.amazon.com.br/dp/B09ABC12345'];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual(['https://www.amazon.com.br/dp/B09ABC12345']);
  });

  it('rejects canal promotion links', () => {
    const links = [
      'https://bit.ly/canal123',
      'https://adrena.click/ofertas/something',
      'https://linkmc.click/ofertas/something',
    ];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual([]);
  });

  it('rejects mercadolivre social links', () => {
    const links = ['https://www.mercadolivre.com.br/social/abc123'];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(linkProcessor.filterRelevantLinks([])).toEqual([]);
  });

  it('passes unknown domains through (denylist behavior)', () => {
    const links = ['https://someunknownshop.com.br/produto/123'];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual(links);
  });

  it('keeps all links that are not rejected', () => {
    const links = [
      'https://www.shopee.com.br/produto-i.123',
      'https://s.shopee.com.br/abc',
      'https://tidd.ly/xyzabc',
    ];
    expect(linkProcessor.filterRelevantLinks(links)).toEqual(links);
  });
});
