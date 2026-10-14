import { describe, expect, test } from 'bun:test';
import AmazonRewriter from './amazon';

describe('AmazonRewriter', () => {
  test('injects affiliate tag into a standard product URL', async () => {
    const rewriter = new AmazonRewriter('mytag-20');
    const result = await rewriter.rewrite('https://www.amazon.com.br/dp/B09ABC12345');
    expect(result).toContain('tag=mytag-20');
  });

  test('extracts ASIN from a long URL with path noise', async () => {
    const rewriter = new AmazonRewriter('mytag-20');
    const result = await rewriter.rewrite(
      'https://www.amazon.com.br/some-product-name/dp/B09ABC12345/ref=sr_1_1',
    );
    expect(result).toContain('B09ABC12345');
    expect(result).toContain('tag=mytag-20');
  });

  test('strips existing query params before adding tag', async () => {
    const rewriter = new AmazonRewriter('mytag-20');
    const result = await rewriter.rewrite('https://www.amazon.com.br/dp/B09ABC12345?ref=nosim&psc=1');
    const url = new URL(result as string);
    expect(url.searchParams.get('tag')).toBe('mytag-20');
    expect(url.searchParams.get('psc')).toBeNull();
  });

  test('returns null when not configured', async () => {
    const rewriter = new AmazonRewriter(null);
    expect(await rewriter.rewrite('https://www.amazon.com.br/dp/B09ABC12345')).toBeNull();
  });

  test('handles /gp/product/ URLs', async () => {
    const rewriter = new AmazonRewriter('mytag-20');
    const result = await rewriter.rewrite('https://www.amazon.com.br/gp/product/B09ABC12345');
    expect(result).toContain('B09ABC12345');
    expect(result).toContain('tag=mytag-20');
  });

  test('canHandle matches amazon.com.br and amzn.', () => {
    const rewriter = new AmazonRewriter('x');
    expect(rewriter.canHandle('https://www.amazon.com.br/dp/X')).toBe(true);
    expect(rewriter.canHandle('https://amzn.to/abc')).toBe(true);
    expect(rewriter.canHandle('https://shopee.com.br/x')).toBe(false);
  });
});
