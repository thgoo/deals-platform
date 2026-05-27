import { describe, expect, test } from 'bun:test';
import { extractRequestSchema, extractionSchema } from './schemas';

describe('extractRequestSchema', () => {
  test('accepts valid input', () => {
    const result = extractRequestSchema.safeParse({
      text: 'PS5 R$ 2.849',
      chat: 'promo_channel',
      messageId: 42,
      links: ['https://amazon.com.br/dp/B00XXX'],
    });
    expect(result.success).toBe(true);
  });

  test('defaults links to empty array when omitted', () => {
    const result = extractRequestSchema.safeParse({
      text: 'PS5 R$ 2.849',
      chat: 'promo_channel',
      messageId: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.links).toEqual([]);
  });

  test('rejects empty text', () => {
    const result = extractRequestSchema.safeParse({
      text: '',
      chat: 'promo_channel',
      messageId: 42,
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-positive messageId', () => {
    const result = extractRequestSchema.safeParse({
      text: 'PS5 R$ 2.849',
      chat: 'promo_channel',
      messageId: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid URL in links', () => {
    const result = extractRequestSchema.safeParse({
      text: 'PS5 R$ 2.849',
      chat: 'promo_channel',
      messageId: 42,
      links: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });
});

describe('extractionSchema', () => {
  const base = {
    text: 'PlayStation 5 Slim Digital 1TB - R$ 2.849',
    description: 'Pra você finalmente zerar aquele backlog.',
    product: 'PlayStation 5 Slim Digital 1TB',
    store: 'Amazon',
    price: 284900,
    coupons: [],
    productKey: 'sony-playstation-5-slim-digital-1tb',
    category: 'games',
  };

  test('accepts a complete valid extraction', () => {
    expect(extractionSchema.safeParse(base).success).toBe(true);
  });

  test('rounds price to nearest integer', () => {
    const result = extractionSchema.safeParse({ ...base, price: 284900.7 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price).toBe(284901);
  });

  test('accepts all nullable fields as null', () => {
    const result = extractionSchema.safeParse({
      ...base,
      product: null,
      store: null,
      price: null,
      productKey: null,
      category: null,
    });
    expect(result.success).toBe(true);
  });

  test('maps unknown category to "others"', () => {
    const result = extractionSchema.safeParse({ ...base, category: 'electronics' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('others');
  });

  test('defaults coupons to empty array when omitted', () => {
    const { coupons: _coupons, ...withoutCoupons } = base;
    const result = extractionSchema.safeParse(withoutCoupons);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.coupons).toEqual([]);
  });

  test('transforms null discount to undefined (field omitted in JSON)', () => {
    const result = extractionSchema.safeParse({
      ...base,
      coupons: [{ code: 'PROMO10', discount: null }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.coupons[0]?.discount).toBeUndefined();
  });

  test('accepts coupon with string discount', () => {
    const result = extractionSchema.safeParse({
      ...base,
      coupons: [{ code: 'PROMO10', discount: 'R$10 OFF' }],
    });
    expect(result.success).toBe(true);
  });

  test('accepts every valid category', () => {
    const categories = [
      'smartphones', 'notebooks', 'tvs', 'monitors', 'tablets',
      'audio', 'games', 'hardware', 'peripherals', 'appliances',
      'home', 'office', 'fashion', 'beauty', 'supplements', 'food', 'others',
    ];
    for (const category of categories) {
      expect(extractionSchema.safeParse({ ...base, category }).success).toBe(true);
    }
  });
});
