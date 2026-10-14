import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type { EmbeddingModelVersion, NewProduct, Product } from '~/db/schemas/products';
import db from '~/db';
import { productsTable } from '~/db/schemas/products';
import { isUuid } from '~/utils/ids';

export interface CreateProductInput {
  canonicalName: string;
  modelKey: string | null;
  category: string | null;
  embedding: number[];
  embeddingModelVersion: EmbeddingModelVersion;
}

export default class ProductService {
  async create(input: CreateProductInput): Promise<Product> {
    const newProduct: NewProduct = {
      id: randomUUID(),
      canonicalName: input.canonicalName,
      modelKey: input.modelKey,
      category: input.category,
      embedding: input.embedding,
      embeddingModelVersion: input.embeddingModelVersion,
    };

    const [row] = await db.insert(productsTable).values(newProduct).returning();
    if (!row) throw new Error('Insert returned no product row');
    return row;
  }

  async findById(id: string): Promise<Product | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, id));

    return row ?? null;
  }

  async findAll(): Promise<Product[]> {
    return db.select().from(productsTable);
  }
}
