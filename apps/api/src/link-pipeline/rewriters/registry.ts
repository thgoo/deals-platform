import type { AffiliateRewriter } from './types';
import type { AffiliateConfig } from '~/link-pipeline/config';
import type { Registry } from '~/link-pipeline/utils/create-registry';
import { createRegistry } from '~/link-pipeline/utils/create-registry';
import AliExpressRewriter from './providers/aliexpress';
import AmazonRewriter from './providers/amazon';
import AwinRewriter from './providers/awin';
import MagaluRewriter from './providers/magalu';
import MercadoLivreRewriter from './providers/mercadolivre';
import NaturaRewriter from './providers/natura';
import ShopeeRewriter from './providers/shopee';

/**
 * Builds a registry pre-loaded with all rewriters wired to their affiliate config.
 * A rewriter is *always* registered, even if its credentials are missing — in that
 * case its `rewrite()` returns null and the pipeline falls back to cleaning the URL.
 */
export function buildRewriterRegistry(cfg: AffiliateConfig): Registry<AffiliateRewriter> {
  const registry = createRegistry<AffiliateRewriter>();

  registry.register(new AmazonRewriter(cfg.amazon ?? null));
  registry.register(new ShopeeRewriter(cfg.shopee ?? null));
  registry.register(new MercadoLivreRewriter(cfg.mercadolivre ?? null));
  registry.register(new MagaluRewriter(cfg.magalu ?? null));
  registry.register(new NaturaRewriter(cfg.natura ?? null));
  registry.register(new AliExpressRewriter(cfg.aliexpress ?? null));
  registry.register(new AwinRewriter(cfg.awin ?? null));

  return registry;
}
