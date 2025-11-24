import { describe, expect, it } from 'bun:test';
import { cleanPromoText } from './utils';

describe('cleanPromoText', () => {
  it('should remove "Entre no nosso grupo" footer', () => {
    const input = `🔥 SAMSUNG GALAXY S24 (256 GB) (CINZA) 📱

Vendido pela MAGAZINE LUIZA no ALIEXPRESS!

💰 Valor: R$2.524 (Em até 12X sem juros)
📄 Cupom: PROMOBR07

🔗 Link: https://s.click.aliexpress.com/e/...

💰Entre no nosso grupo de ofertas:
Telegram:
https://t.me/garimposdodepinho
Whatsapp:
https://bit.ly/canalofertasadrenaline`;

    const expected = `🔥 SAMSUNG GALAXY S24 (256 GB) (CINZA) 📱

Vendido pela MAGAZINE LUIZA no ALIEXPRESS!

💰 Valor: R$2.524 (Em até 12X sem juros)
📄 Cupom: PROMOBR07

🔗 Link: https://s.click.aliexpress.com/e/...`;

    expect(cleanPromoText(input)).toBe(expected);
  });

  it('should remove channel promotion footer with emojis', () => {
    const input = `Gabinete Gamer Pichau HX750 Ligno Com Tela LCD por R$569,99

Compre aqui:
https://curt.link/qYMGL

📱 GARIMPOS DO DE PINHO 📱
https://t.me/ofertasadrenaline
Whatsapp:
https://bit.ly/canalofertasadrenaline`;

    const expected = `Gabinete Gamer Pichau HX750 Ligno Com Tela LCD por R$569,99

Compre aqui:
https://curt.link/qYMGL`;

    expect(cleanPromoText(input)).toBe(expected);
  });

  it('should keep text without footer unchanged', () => {
    const input = `🔥 Produto incrível por R$100

Link: https://example.com/produto`;

    expect(cleanPromoText(input)).toBe(input);
  });

  it('should handle empty text', () => {
    expect(cleanPromoText('')).toBe('');
  });

  it('should handle text with only footer', () => {
    const input = `💰Entre no nosso grupo de ofertas:
Telegram:
https://t.me/grupo`;

    expect(cleanPromoText(input)).toBe('');
  });
});
