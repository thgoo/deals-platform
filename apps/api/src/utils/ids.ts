const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Product and alert ids are Postgres uuid columns: comparing one with a string
 * that isn't a UUID is a query error, not "no match". Ids from requests (URL
 * params, localStorage) go through this first so a malformed id behaves like an
 * unknown one.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
