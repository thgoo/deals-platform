import { describe, expect, it } from 'bun:test';
import { amazonProvider } from './amazon';
import { magaluProvider } from './magalu';
import { naturaProvider } from './natura';

// ─── Amazon ──────────────────────────────────────────────────────────────────

describe('AmazonProvider', () => {
  it('injects affiliate tag into a standard product URL', async () => {
    amazonProvider.configure({ amazon: 'mytag-20' });
    const result = await amazonProvider.rewrite('https://www.amazon.com.br/dp/B09ABC12345');
    expect(result).toContain('tag=mytag-20');
  });

  it('extracts ASIN from a long product URL', async () => {
    amazonProvider.configure({ amazon: 'mytag-20' });
    const result = await amazonProvider.rewrite('https://www.amazon.com.br/some-product-name/dp/B09ABC12345/ref=sr_1_1');
    expect(result).toContain('B09ABC12345');
    expect(result).toContain('tag=mytag-20');
  });

  it('strips existing query params before adding tag', async () => {
    amazonProvider.configure({ amazon: 'mytag-20' });
    const result = await amazonProvider.rewrite('https://www.amazon.com.br/dp/B09ABC12345?ref=nosim&psc=1');
    const url = new URL(result!);
    expect(url.searchParams.get('tag')).toBe('mytag-20');
    expect(url.searchParams.get('psc')).toBeNull();
  });

  it('returns null when not configured', async () => {
    amazonProvider.configure({});
    const result = await amazonProvider.rewrite('https://www.amazon.com.br/dp/B09ABC12345');
    expect(result).toBeNull();
  });
});

// ─── Natura ──────────────────────────────────────────────────────────────────

describe('NaturaProvider', () => {
  it('injects consultoria param', async () => {
    naturaProvider.configure({ natura: 'consultor123' });
    const result = await naturaProvider.rewrite('https://www.natura.com.br/produto/sabonete-123');
    expect(result).toContain('consultoria=consultor123');
  });

  it('replaces existing consultoria param', async () => {
    naturaProvider.configure({ natura: 'consultor123' });
    const result = await naturaProvider.rewrite('https://www.natura.com.br/produto/sabonete?consultoria=old');
    const url = new URL(result!);
    expect(url.searchParams.get('consultoria')).toBe('consultor123');
  });

  it('returns null when not configured', async () => {
    naturaProvider.configure({});
    const result = await naturaProvider.rewrite('https://www.natura.com.br/produto/abc');
    expect(result).toBeNull();
  });
});

// ─── Magalu ───────────────────────────────────────────────────────────────────

describe('MagaluProvider', () => {
  it('replaces username in magazinevoce URL', async () => {
    magaluProvider.configure({ magalu: { username: 'meuusuario' } });
    const result = await magaluProvider.rewrite('https://www.magazinevoce.com.br/outroupsuario/produto/123');
    expect(result).toContain('/meuusuario/');
    expect(result).not.toContain('/outroupsuario/');
  });

  it('replaces promoter_id in magazineluiza URL', async () => {
    magaluProvider.configure({ magalu: { promoterId: '99999' } });
    const result = await magaluProvider.rewrite(
      'https://www.magazineluiza.com.br/produto/123?promoter_id=11111&utm_campaign=11111&c=11111',
    );
    const url = new URL(result!);
    expect(url.searchParams.get('promoter_id')).toBe('99999');
    expect(url.searchParams.get('utm_campaign')).toBe('99999');
    expect(url.searchParams.get('c')).toBe('99999');
  });

  it('returns null for magazineluiza URL without promoter_id param', async () => {
    magaluProvider.configure({ magalu: { promoterId: '99999' } });
    const result = await magaluProvider.rewrite('https://www.magazineluiza.com.br/produto/123');
    expect(result).toBeNull();
  });

  it('returns null when not configured', async () => {
    magaluProvider.configure({});
    const result = await magaluProvider.rewrite('https://www.magazinevoce.com.br/alguem/produto/123');
    expect(result).toBeNull();
  });
});
