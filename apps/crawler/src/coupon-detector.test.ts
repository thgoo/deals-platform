import { describe, expect, it } from 'bun:test';
import { determineDealType } from './classifiers/deal-classifier';
import { detectCoupons } from './detectors/coupon-detector';

describe('Coupon Detector', () => {
  describe('detectCoupons', () => {
    it('should detect single coupon from Mercado Livre example', () => {
      const text = `Mercado Livre
15% OFF
* Em todos os produtos
* Limite de R$60

cupom: CUPOMNOMELI
https://mercadolivre.com/sec/1caqtpF`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(true);
      expect(result.coupons).toHaveLength(1);
      expect(result?.coupons[0]?.code).toBe('CUPOMNOMELI');
      expect(result?.coupons[0]?.discount).toBeDefined();
    });

    it('should detect multiple coupons separated by /', () => {
      const text = `Ali Magalu - Galaxy S25 5G 256GB Galaxy AI Silver 6,2 "12GB

R$ 3.447,76 - 12x sem juros

cupom: HARDMOB8 / PROMOBR08
https://s.click.aliexpress.com/e/_c3y5otih`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(true);
      expect(result.coupons).toHaveLength(2);
      expect(result?.coupons[0]?.code).toBe('HARDMOB8');
      expect(result?.coupons[1]?.code).toBe('PROMOBR08');
    });

    it('should detect coupon with different case variations', () => {
      const text = `Mercado Livre
8% OFF em R$ 499
* Limite de R$150

cupom: 3SP3C1T1
https://mercadolivre.com/sec/1caqtpF`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(true);
      expect(result.coupons).toHaveLength(1);
      expect(result?.coupons[0]?.code).toBe('3SP3C1T1');
    });

    it('should NOT detect coupon in product-only posts', () => {
      const text = `Amazon - Só no app

30% off em Livros
* 03/11 ate 20/11

https://www.hardmob.com.br/threads/833119-AMZSo-no-app-30-off-em-Livros-0311-ate-2011`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(false);
      expect(result.coupons).toHaveLength(0);
    });

    it('should NOT detect coupon when only mentioned in text', () => {
      const text = `🔥 332° - Cupom Mercado Livre 15% limitado em R$60
🎫 Cupom
🏪 Mercado Livre
💬 11 Comentários

➡️ https://promo.ninja/dRzRe

⚠️ Essa promo pode acabar a qualquer momento`;

      const result = detectCoupons(text);

      // Não deve detectar porque não tem "cupom: CODIGO"
      expect(result.isCoupon).toBe(false);
    });

    it('should handle Amazon discount without coupon code', () => {
      const text = `Amazon

R$ 100 OFF em  R$ 500

https://www.hardmob.com.br/threads/833100-Amazon-R-100-off-em-compras-a-partir-de-R-500?p=17359452#post17359452`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(false);
      expect(result.coupons).toHaveLength(0);
    });

    it('should ignore coupon code when it is not really a coupon', () => {
      const text = `CUPOM NIKE AINDA ATIVO

👟 Tênis Nike Air Max Nuaxis

🔥 DE 549 | POR 287
🎟 CUPOM: NIKE40
🔗 https://tidd.ly/47WTzXC`;

      const result = detectCoupons(text);

      expect(result.isCoupon).toBe(true);
      expect(result.coupons).toHaveLength(1);
      expect(result?.coupons[0]?.code).toBe('NIKE40');
    });
  });

  describe('determineDealType', () => {
    it('should classify as coupon when coupon code is present', () => {
      const text = `cupom: HARDMOB8
R$ 3.447,76`;

      expect(determineDealType(text)).toBe('coupon');
    });

    it('should classify as product when only price is present', () => {
      const text = `Amazon
R$ 100 OFF em R$ 500`;

      expect(determineDealType(text)).toBe('product');
    });

    it('should classify as info when neither coupon nor price', () => {
      const text = `Nova promoção chegando em breve!
Fique ligado no canal.`;

      expect(determineDealType(text)).toBe('info');
    });
  });
});
