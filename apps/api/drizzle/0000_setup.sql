-- Extensions and collations the schema depends on. Runs before any table.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
-- Case- and accent-insensitive comparison for human text ("Amazon" = "AMAZON",
-- "Você" = "Voce"), matching the old MariaDB utf8mb4_unicode_ci behavior.
-- Nondeterministic: LIKE on it requires PostgreSQL 18+.
CREATE COLLATION IF NOT EXISTS ci_ai (provider = icu, locale = 'und-u-ks-level1', deterministic = false);
