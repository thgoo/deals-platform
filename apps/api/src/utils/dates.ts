/**
 * A DB timestamp as it goes over the wire: Date becomes ISO 8601 (what
 * JSON.stringify does implicitly), strings pass through unchanged.
 */
export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
