import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type { EmbeddingModelVersion, NewProduct, Product } from '~/db/schemas/products';
import db from '~/db';
import { productsTable } from '~/db/schemas/products';

export interface CreateProductInput {
  canonicalName: string;
  modelKey: string | null;
  category: string | null;
  embedding: number[];
  embeddingModelVersion: EmbeddingModelVersion;
}

export default class ProductService {
  private parse(row: Product): Product {
    return {
      ...row,
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
    };
  }

  async create(input: CreateProductInput): Promise<Product> {
    const newProduct: NewProduct = {
      id: randomUUID(),
      canonicalName: input.canonicalName,
      modelKey: input.modelKey,
      category: input.category,
      embedding: input.embedding,
      embeddingModelVersion: input.embeddingModelVersion,
    };

    await db.insert(productsTable).values(newProduct);

    const [row] = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, newProduct.id));

    return this.parse(row);
  }

  async findById(id: string): Promise<Product | null> {
    const [row] = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, id));

    return row ? this.parse(row) : null;
  }

  async findAll(): Promise<Product[]> {
    const rows = await db.select().from(productsTable);
    return rows.map(row => this.parse(row));
  }
}
