import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================================
// TYPES
// ============================================================================

export interface AffiliateConfig {
  amazon?: string;          // Amazon Associate Tag (e.g., "seutag-20")
  shopee?: string;          // Shopee Affiliate ID
  mercadolivre?: string;    // Mercado Livre Affiliate ID
  aliexpress?: string;      // AliExpress Affiliate ID
  magalu?: string;          // Magazine Luiza Affiliate ID
  natura?: string;          // Natura Affiliate ID
}

interface LinkRewriteResult {
  original: string;
  rewritten: string;
  platform: string | null;
  success: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SHORTENER_DOMAINS = [
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
];

// Intermediate affiliate network domains that we should follow
const AFFILIATE_NETWORK_DOMAINS = [
  'awin1.com',
  'awin.com',
  'go2cloud.org',
  'redirect.viglink.com',
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Rewrites a list of links by replacing affiliate IDs
 */
export async function rewriteLinks(
  links: string[],
  config: AffiliateConfig,
): Promise<string[]> {
  const results = await Promise.all(
    links.map(link => rewriteSingleLink(link, config)),
  );

  return results.map(r => r.rewritten);
}

/**
 * Rewrites a single link
 */
async function rewriteSingleLink(
  url: string,
  config: AffiliateConfig,
): Promise<LinkRewriteResult> {
  try {
    // Detect if it's a shortener
    const isShortened = SHORTENER_DOMAINS.some(domain => url.includes(domain));

    let finalUrl = url;

    // Expand shortened links
    if (isShortened) {
      finalUrl = await expandUrl(url);
    }

    // Detect platform and rewrite
    const platform = detectPlatform(finalUrl);

    if (!platform) {
      return {
        original: url,
        rewritten: url,
        platform: null,
        success: false,
      };
    }

    const rewritten = rewriteByPlatform(finalUrl, platform, config);

    return {
      original: url,
      rewritten: rewritten || url,
      platform,
      success: !!rewritten,
    };
  } catch (error) {
    console.error(`[LINK-REWRITER] Error rewriting ${url}:`, error);
    return {
      original: url,
      rewritten: url,
      platform: null,
      success: false,
    };
  }
}

// ============================================================================
// URL EXPANSION
// ============================================================================

/**
 * Expands a shortened link by following redirects
 */
async function expandUrl(shortUrl: string): Promise<string> {
  try {
    const response = await axios.get(shortUrl, {
      maxRedirects: 10,
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // 1. First try to get the final URL from redirects
    let finalUrl = response.request.res?.responseUrl || response.config.url || shortUrl;

    // 2. If it went through an intermediate affiliate network, try to follow one more redirect
    if (isAffiliateNetworkUrl(finalUrl)) {
      console.log(`[LINK-REWRITER] Detected affiliate network: ${finalUrl}`);
      const actualDestination = await followAffiliateNetwork(finalUrl);
      if (actualDestination) {
        finalUrl = actualDestination;
      }
    }

    // 3. If the redirect worked and changed the URL, use it
    if (finalUrl !== shortUrl && !finalUrl.includes('/ap/signin')) {
      return finalUrl;
    }

    // 4. If the response is HTML, try to extract link from content (only for specific cases)
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html') && response.data) {
      // Only try to extract from HTML if it's a known shortener that uses HTML
      if (shortUrl.includes('tecno.click') || shortUrl.includes('tidd.ly')) {
        const extractedLink = extractLinkFromHtml(response.data, shortUrl);
        if (extractedLink && isValidProductLink(extractedLink)) {
          console.log(`[LINK-REWRITER] Extracted from HTML: ${shortUrl} -> ${extractedLink}`);
          return extractedLink;
        }
      }
    }

    return finalUrl;
  } catch {
    console.error(`[LINK-REWRITER] Failed to expand ${shortUrl}`);
    return shortUrl;
  }
}

/**
 * Checks if the URL is from an intermediate affiliate network
 */
function isAffiliateNetworkUrl(url: string): boolean {
  return AFFILIATE_NETWORK_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Follows the redirect from an affiliate network to get the final destination
 */
async function followAffiliateNetwork(networkUrl: string): Promise<string | null> {
  try {
    // For Awin, the destination is in the 'ued' parameter (URL encoded destination)
    const urlObj = new URL(networkUrl);

    if (networkUrl.includes('awin')) {
      const ued = urlObj.searchParams.get('ued');
      if (ued) {
        const decoded = decodeURIComponent(ued);
        console.log(`[LINK-REWRITER] Extracted from Awin: ${decoded}`);
        return decoded;
      }
    }

    // For other networks, try to make the request and follow the redirect
    const response = await axios.get(networkUrl, {
      maxRedirects: 5,
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const finalUrl = response.request.res?.responseUrl || response.config.url;
    return finalUrl !== networkUrl ? finalUrl : null;
  } catch (error) {
    console.error('[LINK-REWRITER] Failed to follow affiliate network:', error);
    return null;
  }
}

// ============================================================================
// LINK VALIDATION
// ============================================================================

/**
 * Validates if an extracted link is really a valid product link
 */
function isValidProductLink(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Reject login/authentication pages
    if (url.includes('/ap/signin') ||
        url.includes('/login') ||
        url.includes('/auth') ||
        url.includes('openid.')) {
      return false;
    }

    // Reject if it's not from a known store domain
    const validDomains = [
      'amazon.com.br',
      'shopee.com.br',
      'mercadolivre.com.br',
      'aliexpress.com',
      'magazineluiza.com.br',
      'natura.com.br',
    ];

    const hasValidDomain = validDomains.some(domain => urlObj.hostname.includes(domain));
    if (!hasValidDomain) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// EXTRACT LINK FROM HTML
// ============================================================================
function extractLinkFromHtml(html: string, originalUrl: string): string | null {
  try {
    const $ = cheerio.load(html);

    // Pattern 1: Link in meta refresh
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=(.+)/i);
      if (match) return match[1]?.trim() || null;
    }

    // Pattern 2: Link in <a> with text "clique aqui" (tecno.click)
    const clickHereLink = $('a:contains("clique aqui")').attr('href');
    if (clickHereLink) return clickHereLink;

    // Pattern 3: First absolute link that is not the same domain
    const domain = new URL(originalUrl).hostname;
    const links = $('a[href^="http"]');

    for (const link of links) {
      const href = $(link).attr('href');
      if (href && !href.includes(domain)) {
        return href;
      }
    }

    // Pattern 4: JavaScript redirect (window.location)
    const scriptContent = $('script').text();
    const jsRedirect = scriptContent.match(/(?:window\.location|location\.href)\s*=\s*["']([^"']+)["']/);
    if (jsRedirect) return jsRedirect[1] || null;

    return null;
  } catch (error) {
    console.error('[LINK-REWRITER] Failed to parse HTML:', error);
    return null;
  }
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

function detectPlatform(url: string): string | null {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('amazon.com.br') || urlLower.includes('amzn.')) {
    return 'amazon';
  }
  if (urlLower.includes('shopee.com.br')) {
    return 'shopee';
  }
  if (urlLower.includes('mercadolivre.com.br') || urlLower.includes('mercadolibre.')) {
    return 'mercadolivre';
  }
  if (urlLower.includes('aliexpress.com')) {
    return 'aliexpress';
  }
  if (urlLower.includes('magazineluiza.com.br') || urlLower.includes('magalu.')) {
    return 'magalu';
  }
  if (urlLower.includes('natura.com.br')) {
    return 'natura';
  }

  return null;
}

// ============================================================================
// PLATFORM-SPECIFIC REWRITING
// ============================================================================

function rewriteByPlatform(
  url: string,
  platform: string,
  config: AffiliateConfig,
): string | null {
  switch (platform) {
    case 'amazon':
      return rewriteAmazon(url, config.amazon);
    case 'shopee':
      return rewriteShopee(url, config.shopee);
    case 'mercadolivre':
      return rewriteMercadoLivre(url, config.mercadolivre);
    case 'aliexpress':
      return rewriteAliExpress(url, config.aliexpress);
    case 'magalu':
      return rewriteMagalu(url, config.magalu);
    case 'natura':
      return rewriteNatura(url, config.natura);
    default:
      return null;
  }
}

// ============================================================================
// AMAZON
// ============================================================================

function rewriteAmazon(url: string, affiliateTag?: string): string | null {
  if (!affiliateTag) return null;

  try {
    const urlObj = new URL(url);

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('tag');
    urlObj.searchParams.delete('linkCode');
    urlObj.searchParams.delete('ref_');
    urlObj.searchParams.delete('pf_rd_r');
    urlObj.searchParams.delete('pf_rd_p');
    urlObj.searchParams.delete('pf_rd_m');
    urlObj.searchParams.delete('pf_rd_s');
    urlObj.searchParams.delete('pf_rd_t');
    urlObj.searchParams.delete('pf_rd_i');

    // Add your affiliate tag
    urlObj.searchParams.set('tag', affiliateTag);

    return urlObj.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// SHOPEE
// ============================================================================

function rewriteShopee(url: string, affiliateId?: string): string | null {
  if (!affiliateId) return null;

  try {
    const urlObj = new URL(url);

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('af_siteid');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_content');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    urlObj.searchParams.delete('utm_term');
    urlObj.searchParams.delete('uls_trackid');

    // Add your affiliate parameters
    urlObj.searchParams.set('af_siteid', affiliateId);
    urlObj.searchParams.set('utm_source', `an_${affiliateId}`);
    urlObj.searchParams.set('utm_medium', 'affiliates');
    urlObj.searchParams.set('utm_content', affiliateId);

    return urlObj.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// MERCADO LIVRE
// ============================================================================

function rewriteMercadoLivre(url: string, affiliateId?: string): string | null {
  if (!affiliateId) return null;

  try {
    const urlObj = new URL(url);

    // Ignore links that are not direct product links
    // /social/ = lists/showcases from other users
    // /stores/ = stores
    // /ofertas/ = general offers pages
    if (urlObj.pathname.includes('/social/') ||
        urlObj.pathname.includes('/stores/') ||
        urlObj.pathname.includes('/ofertas/')) {
      console.log(`[LINK-REWRITER] Skipping ML non-product link: ${url}`);
      return null; // Return null to keep the original link
    }

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('pdp_source');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    urlObj.searchParams.delete('utm_content');
    urlObj.searchParams.delete('matt_tool');
    urlObj.searchParams.delete('matt_word');

    // Add your affiliate parameter
    urlObj.searchParams.set('pdp_source', affiliateId);

    return urlObj.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// ALIEXPRESS
// ============================================================================

function rewriteAliExpress(url: string, affiliateId?: string): string | null {
  if (!affiliateId) return null;

  try {
    const urlObj = new URL(url);

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('aff_trace_key');
    urlObj.searchParams.delete('aff_platform');
    urlObj.searchParams.delete('aff_short_key');
    urlObj.searchParams.delete('terminal_id');
    urlObj.searchParams.delete('afSmartRedirect');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');

    // Add your affiliate parameter
    urlObj.searchParams.set('aff_trace_key', affiliateId);

    return urlObj.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// MAGAZINE LUIZA
// ============================================================================

function rewriteMagalu(url: string, affiliateId?: string): string | null {
  if (!affiliateId) return null;

  try {
    const urlObj = new URL(url);

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('partner_id');
    urlObj.searchParams.delete('seller_id');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');

    // Add your affiliate parameter
    urlObj.searchParams.set('partner_id', affiliateId);

    return urlObj.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// NATURA
// ============================================================================

function rewriteNatura(url: string, affiliateId?: string): string | null {
  if (!affiliateId) return null;

  try {
    const urlObj = new URL(url);

    // Remove all existing affiliate/tracking parameters
    urlObj.searchParams.delete('consultoria');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');

    // Add your affiliate parameter
    urlObj.searchParams.set('consultoria', affiliateId);

    return urlObj.toString();
  } catch {
    return null;
  }
}
