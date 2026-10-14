import { describe, expect, test } from 'bun:test';
import { filterRelevantLinks } from './link-filter';

describe('filterRelevantLinks', () => {
  test('passes a regular product link through', () => {
    const links = ['https://www.amazon.com.br/dp/B0X'];
    expect(filterRelevantLinks(links)).toEqual(links);
  });

  test('rejects t.me links', () => {
    expect(filterRelevantLinks([
      'https://t.me/canal',
      'https://www.amazon.com.br/dp/B0X',
    ])).toEqual(['https://www.amazon.com.br/dp/B0X']);
  });

  test('rejects channel promotion shorteners', () => {
    expect(filterRelevantLinks([
      'https://bit.ly/canal123',
      'https://adrena.click/ofertas/abc',
      'https://linkmc.click/ofertas/abc',
    ])).toEqual([]);
  });

  test('rejects mercadolivre social links', () => {
    expect(filterRelevantLinks(['https://www.mercadolivre.com.br/social/seller-123']))
      .toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(filterRelevantLinks([])).toEqual([]);
  });

  test('accepts unknown domains (denylist behavior)', () => {
    const links = ['https://someunknownshop.com.br/produto/123'];
    expect(filterRelevantLinks(links)).toEqual(links);
  });

  test('matching is case-insensitive', () => {
    expect(filterRelevantLinks(['https://T.ME/Canal'])).toEqual([]);
  });
});
