// Keyword alert API (/api/alerts/*) response shapes.

export interface AlertDto {
  id: string;
  keyword: string;
  expiresAt: string;
}
