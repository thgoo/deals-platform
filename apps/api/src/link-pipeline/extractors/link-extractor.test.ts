import { describe, expect, test } from 'bun:test';
import { extractLinks } from './link-extractor';

describe('extractLinks', () => {
  test('extracts URLs from text', () => {
    const text = 'check this https://amazon.com.br/dp/B0X and also https://shopee.com.br/p/1';
    expect(extractLinks(text)).toEqual([
      'https://amazon.com.br/dp/B0X',
      'https://shopee.com.br/p/1',
    ]);
  });

  test('merges text URLs with known links, preserving order', () => {
    const text = 'see https://a.com/1';
    const known = ['https://b.com/2'];
    expect(extractLinks(text, known)).toEqual(['https://a.com/1', 'https://b.com/2']);
  });

  test('deduplicates URLs that appear in both text and known links', () => {
    const text = 'https://a.com/1 and https://a.com/1';
    const known = ['https://a.com/1'];
    expect(extractLinks(text, known)).toEqual(['https://a.com/1']);
  });

  test('returns empty array when no URLs are present', () => {
    expect(extractLinks('no links here')).toEqual([]);
  });

  test('accepts http and https schemes', () => {
    const text = 'http://insecure.com and https://secure.com';
    expect(extractLinks(text)).toEqual(['http://insecure.com', 'https://secure.com']);
  });
});
