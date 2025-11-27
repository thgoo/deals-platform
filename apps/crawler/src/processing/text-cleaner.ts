/**
 * Removes call-to-action footers from promo messages.
 * Common patterns:
 * - "💰Entre no nosso grupo de ofertas:"
 * - "📱 GARIMPOS DO DE PINHO 📱"
 * - Links to Telegram/Whatsapp groups
 */
export function cleanPromoText(text: string): string {
  // Split by lines
  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  let foundFooter = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect footer patterns
    const isFooterLine =
      // "Link pra entrar no grupo:" pattern
      /link pra entrar no grupo/iu.test(trimmed) ||
      // "💰Entre no nosso grupo" pattern
      /💰\s*entre\s+no\s+nosso\s+grupo/iu.test(trimmed) ||
      // "Telegram:" or "Whatsapp:" labels
      /^(telegram|whatsapp):\s*$/i.test(trimmed) ||
      // Channel promotion with emojis (e.g., "📱 GARIMPOS DO DE PINHO 📱")
      /^[📱🎯💰🔥✨]+\s*[A-Z\s]+[📱🎯💰🔥✨]+\s*$/iu.test(trimmed) ||
      // t.me or bit.ly links after footer started
      (foundFooter && /https?:\/\/(t\.me|bit\.ly|chat\.whatsapp\.com)/i.test(trimmed));

    if (isFooterLine) {
      foundFooter = true;
      continue; // Skip this line
    }

    // If we found footer and this is an empty line, skip it
    if (foundFooter && trimmed === '') {
      continue;
    }

    // If we haven't found footer yet, keep the line
    if (!foundFooter) {
      cleanedLines.push(line);
    }
  }

  // Join back and trim trailing whitespace
  return cleanedLines.join('\n').trimEnd();
}
