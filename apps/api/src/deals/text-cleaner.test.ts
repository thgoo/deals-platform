import { describe, expect, test } from 'bun:test';
import { cleanPromoText } from './text-cleaner';

describe('cleanPromoText', () => {
  test('returns text unchanged when there is no footer', () => {
    const text = '🎮 PlayStation 5 Slim\nPor R$ 2849\nhttps://amazon.com.br/dp/X';
    expect(cleanPromoText(text)).toBe(text);
  });

  test('strips "link pra entrar no grupo" footer and everything below', () => {
    const input = [
      'PS5 Digital 1TB',
      'Por R$ 2849',
      '',
      'Link pra entrar no grupo:',
      'https://t.me/canal',
    ].join('\n');
    expect(cleanPromoText(input)).toBe('PS5 Digital 1TB\nPor R$ 2849');
  });

  test('strips telegram/whatsapp standalone labels', () => {
    const input = [
      'Deal here',
      'Telegram:',
      'https://t.me/foo',
    ].join('\n');
    expect(cleanPromoText(input)).toBe('Deal here');
  });

  test('strips emoji-wrapped uppercase footer lines', () => {
    const input = [
      'Real deal',
      '📱 SIGA NOSSO CANAL 📱',
      'https://t.me/canal',
    ].join('\n');
    expect(cleanPromoText(input)).toBe('Real deal');
  });

  test('removes trailing whitespace from cleaned output', () => {
    const input = 'Deal\n\n\nLink pra entrar no grupo:\nhttps://t.me/x';
    expect(cleanPromoText(input).endsWith('\n')).toBe(false);
  });

  test('idempotent — cleaning an already-clean message changes nothing', () => {
    const cleaned = 'Just a deal\nR$ 100';
    expect(cleanPromoText(cleanPromoText(cleaned))).toBe(cleaned);
  });
});
