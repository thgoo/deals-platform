import { describe, expect, test } from 'bun:test';
import NaturaRewriter from './natura';

describe('NaturaRewriter', () => {
  test('injects consultoria param', async () => {
    const rewriter = new NaturaRewriter('consultor123');
    const result = await rewriter.rewrite('https://www.natura.com.br/produto/sabonete-123');
    expect(result).toContain('consultoria=consultor123');
  });

  test('replaces existing consultoria param', async () => {
    const rewriter = new NaturaRewriter('consultor123');
    const result = await rewriter.rewrite('https://www.natura.com.br/produto/sabonete?consultoria=old');
    const url = new URL(result as string);
    expect(url.searchParams.get('consultoria')).toBe('consultor123');
  });

  test('returns null when not configured', async () => {
    const rewriter = new NaturaRewriter(null);
    expect(await rewriter.rewrite('https://www.natura.com.br/produto/abc')).toBeNull();
  });

  test('canHandle accepts only natura.com.br', () => {
    const rewriter = new NaturaRewriter('x');
    expect(rewriter.canHandle('https://www.natura.com.br/p/1')).toBe(true);
    expect(rewriter.canHandle('https://www.amazon.com.br/dp/X')).toBe(false);
  });
});
