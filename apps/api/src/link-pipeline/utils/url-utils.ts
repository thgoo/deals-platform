/**
 * Returns the URL without query string and hash — only protocol://host/path.
 * On parsing failure returns the input unchanged.
 */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Removes the given query parameters from a URL, keeping all others.
 * On parsing failure returns the input unchanged.
 */
export function removeUrlParams(url: string, params: string[]): string {
  try {
    const u = new URL(url);
    for (const p of params) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}
