/**
 * Strips call-to-action footers from promo messages (Telegram channel ads, group invites)
 * so the LLM extractor sees only the deal content. Idempotent: cleaning an already-clean
 * message is a no-op.
 */
export function cleanPromoText(text: string): string {
  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  let foundFooter = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const isFooterLine
      = /link pra entrar no grupo/iu.test(trimmed)
      || /💰\s*entre\s+no\s+nosso\s+grupo/iu.test(trimmed)
      || /^(telegram|whatsapp):\s*$/i.test(trimmed)
      || /^[📱🎯💰🔥✨]+\s*[A-Z\s]+[📱🎯💰🔥✨]+\s*$/iu.test(trimmed)
      || (foundFooter && /https?:\/\/(t\.me|bit\.ly|chat\.whatsapp\.com)/i.test(trimmed));

    if (isFooterLine) {
      foundFooter = true;
      continue;
    }

    if (foundFooter && trimmed === '') {
      continue;
    }

    if (!foundFooter) {
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n').trimEnd();
}
