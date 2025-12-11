export interface AffiliateProvider {
  readonly name: string;
  canHandle(url: string): boolean;
  rewrite(url: string, config: unknown): Promise<string | null>;
}
