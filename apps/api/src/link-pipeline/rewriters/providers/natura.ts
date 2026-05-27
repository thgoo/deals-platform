import type { AffiliateRewriter } from '../types';
import { logger } from '~/logger';

export default class NaturaRewriter implements AffiliateRewriter {
  readonly name = 'natura';

  constructor(private readonly consultoriaId: string | null) {}

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('natura.com.br');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.consultoriaId) return null;

    try {
      const urlObj = new URL(url);
      urlObj.searchParams.delete('consultoria');
      urlObj.searchParams.set('consultoria', this.consultoriaId);

      const rewritten = urlObj.toString();
      logger.debug('Natura link rewritten', { url: rewritten });
      return rewritten;
    } catch {
      logger.debug('Failed to rewrite Natura link', { url });
      return null;
    }
  }
}
