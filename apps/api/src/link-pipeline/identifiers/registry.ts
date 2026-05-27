import type { CanonicalIdentifier } from './types';
import type { Registry } from '~/link-pipeline/utils/create-registry';
import { createRegistry } from '~/link-pipeline/utils/create-registry';
import aliExpressIdentifier from './providers/aliexpress';
import amazonIdentifier from './providers/amazon';
import hostFallbackIdentifier from './providers/host-fallback';
import kabumIdentifier from './providers/kabum';
import magaluIdentifier from './providers/magalu';
import mercadoLivreIdentifier from './providers/mercadolivre';
import pichauIdentifier from './providers/pichau';
import shopeeIdentifier from './providers/shopee';

/**
 * Builds a pre-loaded registry with all canonical-id extractors.
 * Identifiers are stateless, so a single shared registry is fine.
 *
 * Order matters: store-specific identifiers come first so they claim their
 * URLs and keep compact `source` names (`amazon`, `mercadolivre`, ...). The
 * host fallback runs last and catches every remaining (non-shortener) URL.
 */
export function buildIdentifierRegistry(): Registry<CanonicalIdentifier> {
  const registry = createRegistry<CanonicalIdentifier>();

  registry.register(amazonIdentifier);
  registry.register(mercadoLivreIdentifier);
  registry.register(kabumIdentifier);
  registry.register(magaluIdentifier);
  registry.register(aliExpressIdentifier);
  registry.register(shopeeIdentifier);
  registry.register(pichauIdentifier);
  registry.register(hostFallbackIdentifier);

  return registry;
}
