/**
 * A registry of items, each of which can decide whether it handles a given URL.
 * Items are tried in registration order; the first to claim a URL wins.
 *
 * Used by both the affiliate rewriter pipeline and the canonical identifier pipeline.
 * It is intentionally generic — the registry pattern itself is the abstraction,
 * not anything domain-specific.
 */
export interface UrlHandler {
  readonly name: string;
  canHandle(url: string): boolean;
}

export interface Registry<T extends UrlHandler> {
  register(item: T): void;
  findFor(url: string): T | null;
  getAll(): T[];
  has(name: string): boolean;
}

export function createRegistry<T extends UrlHandler>(): Registry<T> {
  const items: T[] = [];

  return {
    register(item: T): void {
      items.push(item);
    },
    findFor(url: string): T | null {
      return items.find(item => item.canHandle(url)) ?? null;
    },
    getAll(): T[] {
      return [...items];
    },
    has(name: string): boolean {
      return items.some(item => item.name === name);
    },
  };
}
