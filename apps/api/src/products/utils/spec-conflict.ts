/**
 * Detects when two product names disagree on a numeric/model spec — even when
 * their embeddings look nearly identical.
 *
 * Background: `text-embedding-3-small` produces almost-the-same vector for two
 * strings that differ in a single number ("RTX 5050" vs "RTX 5060" → ~0.98
 * similarity). The AUTO_MATCH threshold (0.95) lets these through and the
 * resolver links them as the same product — wrong. Spec conflict detection
 * runs BEFORE auto-match: if the two names disagree on a known spec, the
 * resolver falls back to the LLM judge, which is good at this distinction.
 *
 * Patterns intentionally narrow:
 *   - Each requires a recognizable UNIT (BTU, GB, MP, Hz, polegadas, ...)
 *     or a known prefix (RTX/GTX/RX for GPU model). Bare numbers are ignored
 *     to avoid false positives on years, version codes, color hex, etc.
 *   - The numeric capture strips thousand separators ("12.000" == "12000")
 *     so locale variations don't trigger phantom conflicts.
 */

interface SpecPattern {
  /** Internal tag used to bucket extracted values by category. */
  name: string;
  /** Regex with global+case-insensitive flags; group 1 is the numeric value. */
  pattern: RegExp;
}

const SPEC_PATTERNS: SpecPattern[] = [
  // GPU model: "RTX 5060", "RTX5060", "GTX 1660 Super", "RX 7900 XTX".
  { name: 'gpu_model', pattern: /\b(?:RTX|GTX|RX)\s*(\d{3,4})\b/gi },

  // Storage / memory: "256GB", "256 GB", "1TB", "1 TB", "512MB".
  { name: 'storage', pattern: /(\d+(?:[.,]\d+)?)\s*(?:GB|TB|MB)\b/gi },

  // Air conditioner BTU: "12000 BTU", "12.000 BTU", "12000BTU".
  { name: 'btu', pattern: /(\d+(?:[.,]\d+)?)\s*BTU\b/gi },

  // Display size: "27 polegadas", "27 pol", "27 inch", `27"`, `27''`.
  // `\b` is applied only after word-character units (polegadas, pol, inch, in)
  // so symbolic units (`"`, `''`) — which aren't word chars — still match at
  // end of string / before non-word punctuation.
  { name: 'screen_size', pattern: /(\d+(?:[.,]\d+)?)\s*(?:polegadas\b|pol\.|pol\b|inch(?:es)?\b|in\b|"|'')/gi },

  // Battery: "5000mAh", "5000 mAh".
  { name: 'battery', pattern: /(\d+(?:[.,]\d+)?)\s*mAh\b/gi },

  // Power: "1500W", "1500 W", "1500 Watts".
  { name: 'power', pattern: /(\d+(?:[.,]\d+)?)\s*W(?:atts?)?\b/gi },

  // Camera resolution: "48MP", "48 MP".
  { name: 'megapixels', pattern: /(\d+(?:[.,]\d+)?)\s*MP\b/gi },

  // Refresh rate / frequency: "144Hz", "144 Hz", "5GHz" — captured as number,
  // unit suffix is ignored for the equality check.
  { name: 'frequency', pattern: /(\d+(?:[.,]\d+)?)\s*(?:G|M|K)?Hz\b/gi },
];

/**
 * Returns `true` when both names mention specs of the same category but with
 * mutually-exclusive values (each side has at least one value the other lacks).
 *
 * Asymmetric difference is intentionally allowed: "iPhone 15" vs
 * "iPhone 15 256GB" should NOT conflict (one side just omits the spec).
 */
export function specsConflict(a: string, b: string): boolean {
  const aSpecs = extractSpecs(a);
  const bSpecs = extractSpecs(b);

  for (const [name, aValues] of aSpecs) {
    const bValues = bSpecs.get(name);
    if (!bValues || bValues.size === 0) continue;

    const aHasUnique = [...aValues].some(v => !bValues.has(v));
    const bHasUnique = [...bValues].some(v => !aValues.has(v));
    if (aHasUnique && bHasUnique) return true;
  }
  return false;
}

function extractSpecs(text: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const { name, pattern } of SPEC_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const value = parseInt(raw.replace(/[^\d]/g, ''), 10);
      if (Number.isNaN(value)) continue;
      let bucket = result.get(name);
      if (!bucket) {
        bucket = new Set<number>();
        result.set(name, bucket);
      }
      bucket.add(value);
    }
  }
  return result;
}
