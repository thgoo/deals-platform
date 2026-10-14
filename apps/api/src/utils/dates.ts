/**
 * A DB timestamp as it goes over the wire. mysql2 returns Date for typed columns
 * and sometimes a string for raw SQL aggregates; Date becomes ISO 8601 (what
 * JSON.stringify did implicitly), strings pass through unchanged.
 */
export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
