import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../../logger';
import type { AffiliateProvider } from './base';

interface AliExpressConfig {
  appKey: string;
  appSecret: string;
  trackingId: string;
}

interface AliExpressApiResponse {
  aliexpress_affiliate_link_generate_response?: {
    resp_result?: {
      result?: {
        promotion_links?: {
          promotion_link?: Array<{
            promotion_link?: string;
            source_value?: string;
          }>;
        };
      };
    };
  };
}

class AliExpressProvider implements AffiliateProvider {
  readonly name = 'aliexpress';
  private config: AliExpressConfig | null = null;

  configure(appKey: string, appSecret: string, trackingId: string): void {
    this.config = { appKey, appSecret, trackingId };
  }

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('aliexpress.com') || urlLower.includes('s.click.aliexpress.com');
  }

  isConfigured(): boolean {
    return this.config !== null && 
           this.config.appKey !== '' && 
           this.config.appSecret !== '' && 
           this.config.trackingId !== '';
  }

  /**
   * Rewrite using AliExpress API
   * If not configured or fails, returns null (original URL will be used)
   */
  async rewrite(url: string, _config: unknown): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('AliExpress API not configured, skipping affiliate rewrite');
      return null;
    }

    try {
      // Limpa a URL
      const cleanUrl = this.cleanProductUrl(url);
      
      // Gera a URL da API
      const apiUrl = this.generateApiUrl(cleanUrl);

      logger.info('Calling AliExpress API', { productUrl: cleanUrl });

      // Faz a requisição
      const response = await axios.get<AliExpressApiResponse>(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      // Extrai o link de afiliado da resposta
      const affiliateLink = response.data
        ?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links?.promotion_link?.[0]?.promotion_link;

      if (affiliateLink) {
        logger.info('AliExpress affiliate link generated successfully');
        return affiliateLink;
      }

      // Se não conseguiu gerar link, retorna null
      logger.warn('Failed to extract affiliate link from AliExpress API response');
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error calling AliExpress API', { error: errorMsg });
      return null;
    }
  }

  /**
   * Limpa a URL do produto removendo query params
   */
  private cleanProductUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      logger.error('Invalid AliExpress URL', { url });
      throw new Error('Invalid URL');
    }
  }

  /**
   * Gera a assinatura MD5 para a API
   */
  private generateSign(params: Record<string, string>, appSecret: string): string {
    // 1. Ordena os parâmetros por chave (alfabeticamente)
    const sortedKeys = Object.keys(params).sort();

    // 2. Concatena: app_secret + k1+v1 + k2+v2 + ... + app_secret
    let signString = appSecret;
    for (const key of sortedKeys) {
      signString += key + params[key];
    }
    signString += appSecret;

    // 3. Calcula MD5 e retorna em maiúsculas
    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
  }

  /**
   * Gera a URL completa da API com todos os parâmetros e assinatura
   */
  private generateApiUrl(cleanUrl: string): string {
    if (!this.config) {
      throw new Error('AliExpress provider not configured');
    }

    const timestamp = Date.now().toString();

    // Parâmetros da requisição (sem o 'sign')
    const params: Record<string, string> = {
      app_key: this.config.appKey,
      format: 'json',
      method: 'aliexpress.affiliate.link.generate',
      promotion_link_type: '0',
      ship_to_country: 'BR',
      sign_method: 'md5',
      source_values: cleanUrl,
      timestamp,
      tracking_id: this.config.trackingId,
      v: '1',
    };

    // Gera a assinatura
    const sign = this.generateSign(params, this.config.appSecret);
    params.sign = sign;

    // Monta a URL completa
    const baseUrl = 'https://api-sg.aliexpress.com/sync';
    const queryString = new URLSearchParams(params).toString();
    return `${baseUrl}?${queryString}`;
  }
}

export const aliExpressProvider = new AliExpressProvider();
