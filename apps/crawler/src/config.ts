import 'dotenv/config';

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

export interface AffiliateConfig {
  amazon?: string;
  shopee?: ShopeeApiConfig;
  mercadolivre?: string;
  aliexpress: AliExpressApiConfig;
  magalu?: MagaluConfig;
  natura?: string;
  awin?: AwinApiConfig;
}

export interface MagaluConfig {
  username?: string;
  promoterId?: string;
}

export interface Config {
  telegram: {
    apiId: number;
    apiHash: string;
    sessionDir: string;
    sessionName: string;
  };
  backend: {
    baseUrl: string;
    secret: string;
    endpoints: {
      deals: string;
      dealsImage: string;
    };
  };
  media: {
    dir: string;
  };
  extractor: {
    baseUrl: string;
    endpoint: string;
  };
  targetChats: string[];
  affiliates: AffiliateConfig;
}

export const config: Config = {
  telegram: {
    apiId: parseInt(process.env.TG_API_ID || '0'),
    apiHash: process.env.TG_API_HASH || '',
    sessionDir: process.env.SESSION_DIR || './sessions',
    sessionName: process.env.SESSION_NAME || 'promo_session',
  },
  backend: {
    baseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:8000',
    secret: process.env.BACKEND_SECRET || 'devsecret',
    endpoints: {
      deals: '/api/deals',
      dealsImage: '/api/deals/image',
    },
  },
  media: {
    dir: process.env.MEDIA_DIR || './media',
  },
  extractor: {
    baseUrl: process.env.EXTRACTOR_BASE_URL || 'http://localhost:3001',
    endpoint: '/api/extractors/extract',
  },
  targetChats: (process.env.TARGET_CHATS || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean),
  affiliates: {
    amazon: process.env.AMAZON_AFFILIATE_TAG,
    shopee: {
      appId: process.env.SHOPEE_APP_ID || '',
      secret: process.env.SHOPEE_SECRET || '',
    },
    mercadolivre: process.env.MERCADOLIVRE_AFFILIATE_ID,
    // AliExpress: API oficial (obrigatório para funcionar)
    aliexpress: {
      appKey: process.env.ALIEXPRESS_APP_KEY || '',
      appSecret: process.env.ALIEXPRESS_APP_SECRET || '',
      trackingId: process.env.ALIEXPRESS_TRACKING_ID || '',
    },
    awin: {
      publisherId: process.env.AWIN_PUBLISHER_ID || '',
      token: process.env.AWIN_TOKEN || '',
    },
    magalu: {
      username: process.env.MAGALU_AFFILIATE_ID,
      promoterId: process.env.MAGALU_PROMOTER_ID,
    },
    natura: process.env.NATURA_AFFILIATE_ID,
  },
};
