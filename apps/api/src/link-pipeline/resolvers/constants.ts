export const SHORTENER_DOMAINS = [
  'amzn.to',
  'amzn.divulgador.link',
  's.shopee.com.br',
  'mercadolivre.com/sec',
  's.click.aliexpress.com',
  'tidd.ly',
  'tiddly.xyz',
  'magalu.divulgador.link',
  'natura.divulgador.link',
  'tecno.click',
  'curt.link',
  'cutt.ly',
  'divulgador.magalu.com',
  'eusoubarone.link',
  'meli.la',
  'go.promozone.ai',
];

export const AFFILIATE_NETWORK_DOMAINS = [
  'awin1.com',
  'awin.com',
  'go2cloud.org',
  'redirect.viglink.com',
];

/**
 * Hosts whose URLs are NOT product pages — they navigate to channels,
 * collections, videos, articles, or generic redirects. The host-fallback
 * identifier MUST exclude these, otherwise a deal that happens to link to
 * a Telegram channel or a YouTube live stream ends up "mapping" that URL
 * to whatever product was first seen alongside it, and subsequent unrelated
 * deals with the same link get mis-matched to that product.
 *
 * Evidence from real prod data (May 2026 cleanup):
 *   - youtube.com/live/hggfobq_mdc → captured as "product"; 83 unrelated deals
 *     followed the bogus URL anchor.
 *   - linktr.ee/adrenaline_oficial → "Notebook Lenovo IdeaPad"; 26 unrelated
 *     deals routed to it.
 *   - t.me/ofertasadrenaline → "Monitor AOC 22B35"; multiple unrelated deals.
 *
 * Note: this list is for the host-fallback identifier ONLY. The url-resolver's
 * shortener-follow logic uses SHORTENER_DOMAINS — keep them separate.
 */
export const NON_PRODUCT_HOSTS = [
  // Telegram / chat
  't.me',
  // Bio / link aggregators
  'linktr.ee',
  // Generic shorteners (URL anchor-level — different from SHORTENER_DOMAINS
  // which controls redirect-following)
  'tinyurl.com',
  'bit.ly',
  'kb1.me',
  'l1nq.com',
  'r321.app',
  'shope.ee',
  // Custom redirect / aggregator domains
  'linkmc.click',
  'adrena.click',
  'msi.gm',
  // Video platforms
  'youtube.com',
  'youtu.be',
  // Review / news / blogs
  'tecnoblog.net',
];

export const PROMOZONE_RESOLVE_API
  = 'https://link-shortener-501307668672.southamerica-east1.run.app/resolve';

/**
 * Browser-like headers required to avoid being blocked by bot protection
 * on retail sites and shorteners.
 */
export const HTTP_HEADERS: Record<string, string> = {
  // eslint-disable-next-line @stylistic/max-len
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

export const REQUEST_TIMEOUT_MS = 10_000;
