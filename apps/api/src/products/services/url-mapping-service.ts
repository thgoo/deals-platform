import { and, eq } from 'drizzle-orm';
import type { NewProductUrlMapping, ProductUrlMapping, UrlMappingConfidence } from '~/db/schemas/product-url-mappings';
import type { ExternalId } from '~/link-pipeline/types';
import db from '~/db';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';

export default class UrlMappingService {
  async findByExternalId(source: string, externalId: string): Promise<ProductUrlMapping | null> {
    const [row] = await db.select()
      .from(productUrlMappingsTable)
      .where(and(
        eq(productUrlMappingsTable.source, source),
        eq(productUrlMappingsTable.externalId, externalId),
      ))
      .limit(1);

    return row ?? null;
  }

  /**
   * Inserts mappings idempotently — if a (source, externalId) pair already exists,
   * the existing row wins (we don't overwrite to a different product).
   *
   * Uses INSERT IGNORE: simpler than ON DUPLICATE KEY UPDATE with a self-reference
   * (which Drizzle 0.36 mis-serializes as a parameter, sending the column object
   * raw to mysql2 and producing `Unknown column 'name'`).
   */
  async saveAll(
    externalIds: ExternalId[],
    productId: string,
    confidence: UrlMappingConfidence,
  ): Promise<void> {
    if (externalIds.length === 0) return;

    const rows: NewProductUrlMapping[] = externalIds.map(ext => ({
      source: ext.source,
      externalId: ext.externalId,
      productId,
      confidence,
    }));

    await db.insert(productUrlMappingsTable).ignore().values(rows);
  }
}
