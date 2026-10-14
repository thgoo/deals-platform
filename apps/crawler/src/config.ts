import 'dotenv/config';

export interface Config {
  telegram: {
    apiId: number;
    apiHash: string;
    sessionDir: string;
    sessionName: string;
    backend: string;
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
  targetChats: string[];
}

export const config: Config = {
  telegram: {
    apiId: parseInt(process.env.TG_API_ID || '0'),
    apiHash: process.env.TG_API_HASH || '',
    sessionDir: process.env.SESSION_DIR || './sessions',
    sessionName: process.env.SESSION_NAME || 'promo_session',
    backend: process.env.TELEGRAM_BACKEND || 'gramjs',
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
  targetChats: (process.env.TARGET_CHATS || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean),
};
