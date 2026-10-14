import { customType } from 'drizzle-orm/pg-core';

/**
 * Text compared case- and accent-insensitively ("Amazon" = "AMAZON",
 * "Você" = "Voce") in =, LIKE, GROUP BY and DISTINCT — the semantics the
 * MariaDB utf8mb4_unicode_ci columns had. Backed by the nondeterministic ICU
 * collation `ci_ai` created in the first migration (LIKE on it needs PG 18+).
 * Used for human text (store, product names, deal text), never for ids/URLs.
 */
export const ciText = customType<{ data: string }>({
  dataType() {
    return 'text COLLATE "ci_ai"';
  },
});
