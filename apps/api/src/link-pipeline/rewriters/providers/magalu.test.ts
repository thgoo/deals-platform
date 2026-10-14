import { describe, expect, test } from 'bun:test';
import MagaluRewriter from './magalu';

describe('MagaluRewriter', () => {
  test('replaces username in magazinevoce URL', async () => {
    const rewriter = new MagaluRewriter({ username: 'meuusuario' });
    const result = await rewriter.rewrite('https://www.magazinevoce.com.br/outroupsuario/produto/123');
    expect(result).toContain('/meuusuario/');
    expect(result).not.toContain('/outroupsuario/');
  });

  test('replaces promoter_id in magazineluiza URL', async () => {
    const rewriter = new MagaluRewriter({ promoterId: '99999' });
    const result = await rewriter.rewrite(
      'https://www.magazineluiza.com.br/produto/123?promoter_id=11111&utm_campaign=11111&c=11111',
    );
    const url = new URL(result as string);
    expect(url.searchParams.get('promoter_id')).toBe('99999');
    expect(url.searchParams.get('utm_campaign')).toBe('99999');
    expect(url.searchParams.get('c')).toBe('99999');
  });

  test('returns null for magazineluiza URL without promoter_id param', async () => {
    const rewriter = new MagaluRewriter({ promoterId: '99999' });
    const result = await rewriter.rewrite('https://www.magazineluiza.com.br/produto/123');
    expect(result).toBeNull();
  });

  test('returns null when not configured', async () => {
    const rewriter = new MagaluRewriter(null);
    const result = await rewriter.rewrite('https://www.magazinevoce.com.br/alguem/produto/123');
    expect(result).toBeNull();
  });

  test('updates deep_link_value inside magazineluiza URL', async () => {
    const rewriter = new MagaluRewriter({ promoterId: '99999' });
    const dl = encodeURIComponent('app://x?promoter_id=11111&utm_campaign=11111');
    const result = await rewriter.rewrite(
      `https://www.magazineluiza.com.br/produto/123?promoter_id=11111&deep_link_value=${dl}`,
    );
    const url = new URL(result as string);
    const updated = decodeURIComponent(url.searchParams.get('deep_link_value') as string);
    expect(updated).toContain('promoter_id=99999');
    expect(updated).toContain('utm_campaign=99999');
  });
});
