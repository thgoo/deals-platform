import { type SQL, sql } from 'drizzle-orm';

/**
 * Formats a timestamptz as the same ISO 8601 string JSON.stringify(Date)
 * produces ("2026-10-14T19:05:15.000Z"). Raw db.execute() results aren't mapped
 * through the schema, so timestamps would otherwise come back as Postgres text.
 */
export function isoTimestamp(expr: SQL): SQL<string> {
  return sql<string>`to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}
