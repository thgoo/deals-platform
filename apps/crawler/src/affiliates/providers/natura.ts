import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

class NaturaProvider implements AffiliateProvider {
  readonly name = 'natura';
  private consultoriaId: string | null = null;

  configure(config: AffiliateConfig): void {
    this.consultoriaId = config.natura ?? null;
  }

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

export const naturaProvider = new NaturaProvider();
