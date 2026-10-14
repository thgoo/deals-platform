import { describe, expect, test } from 'bun:test';
import { cleanUrl, removeUrlParams } from './url-utils';

describe('cleanUrl', () => {
  test('strips query string and hash', () => {
    expect(cleanUrl('https://www.amazon.com.br/dp/B0CL5KNB9M?tag=foo#section'))
      .toBe('https://www.amazon.com.br/dp/B0CL5KNB9M');
  });

  test('keeps URL untouched when it has no query/hash', () => {
    expect(cleanUrl('https://www.amazon.com.br/dp/B0CL5KNB9M'))
      .toBe('https://www.amazon.com.br/dp/B0CL5KNB9M');
  });

  test('returns input unchanged on parse failure', () => {
    expect(cleanUrl('not a url')).toBe('not a url');
  });
});

describe('removeUrlParams', () => {
  test('removes the specified params', () => {
    const out = removeUrlParams(
      'https://x.com/a?utm_source=fb&keep=1&utm_campaign=x',
      ['utm_source', 'utm_campaign'],
    );
    const u = new URL(out);
    expect(u.searchParams.get('utm_source')).toBeNull();
    expect(u.searchParams.get('utm_campaign')).toBeNull();
    expect(u.searchParams.get('keep')).toBe('1');
  });

  test('returns input unchanged on parse failure', () => {
    expect(removeUrlParams('not a url', ['x'])).toBe('not a url');
  });

  test('no-op when params are absent', () => {
    const out = removeUrlParams('https://x.com/a?b=1', ['x']);
    expect(out).toBe('https://x.com/a?b=1');
  });
});
