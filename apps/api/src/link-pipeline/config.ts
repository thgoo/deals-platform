import { config } from '~/config';

export interface AliExpressApiConfig {
  appKey: string;
  appSecret: string;
  trackingId: string;
}

export interface AwinApiConfig {
  publisherId: string;
  token: string;
}

export interface ShopeeApiConfig {
  appId: string;
  secret: string;
}

export interface MagaluConfig {
  username?: string;
  promoterId?: string;
}

export interface AffiliateConfig {
  amazon?: string;
  mercadolivre?: string;
  natura?: string;
  magalu?: MagaluConfig;
  shopee?: ShopeeApiConfig;
  aliexpress?: AliExpressApiConfig;
  awin?: AwinApiConfig;
}

/**
 * Builds the domain-shaped affiliate config from validated environment variables.
 * Any provider whose required keys are missing is simply absent in the result —
 * its rewriter becomes a no-op (returns null).
 */
export function getAffiliateConfig(): AffiliateConfig {
  return {
    amazon: config.AMAZON_AFFILIATE_TAG,
    mercadolivre: config.MERCADOLIVRE_AFFILIATE_ID,
    natura: config.NATURA_AFFILIATE_ID,
    magalu: config.MAGALU_AFFILIATE_ID || config.MAGALU_PROMOTER_ID
      ? { username: config.MAGALU_AFFILIATE_ID, promoterId: config.MAGALU_PROMOTER_ID }
      : undefined,
    shopee: config.SHOPEE_APP_ID && config.SHOPEE_SECRET
      ? { appId: config.SHOPEE_APP_ID, secret: config.SHOPEE_SECRET }
      : undefined,
    aliexpress: config.ALIEXPRESS_APP_KEY && config.ALIEXPRESS_APP_SECRET && config.ALIEXPRESS_TRACKING_ID
      ? {
        appKey: config.ALIEXPRESS_APP_KEY,
        appSecret: config.ALIEXPRESS_APP_SECRET,
        trackingId: config.ALIEXPRESS_TRACKING_ID,
      }
      : undefined,
    awin: config.AWIN_PUBLISHER_ID && config.AWIN_TOKEN
      ? { publisherId: config.AWIN_PUBLISHER_ID, token: config.AWIN_TOKEN }
      : undefined,
  };
}
