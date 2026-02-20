import type { AffiliateConfig } from '../../config';

export interface AffiliateProvider {
  readonly name: string;
  configure(config: AffiliateConfig): void;
  canHandle(url: string): boolean;
  rewrite(url: string): Promise<string | null>;
}
