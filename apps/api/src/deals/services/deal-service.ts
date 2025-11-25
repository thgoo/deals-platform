import { and, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Deal, NewDeal } from '~/db/schemas/deals';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';

export class DealService {
  /**
   * Parse JSON fields que podem vir como string do MySQL
   */
  private parseDeal(deal: Deal): Deal {
    return {
      ...deal,
      links: typeof deal.links === 'string' ? JSON.parse(deal.links) : deal.links,
      coupons: deal.coupons && typeof deal.coupons === 'string' ? JSON.parse(deal.coupons) : deal.coupons,
    };
  }

  /**
   * Lista todas as lojas disponíveis para filtros
   * @param orderByCount Se true, ordena pela frequência (mais comum primeiro)
   * @returns Array de nomes de lojas distintas
   */
  async getAvailableStores(orderByCount = true): Promise<string[]> {
    // Se orderByCount for true, adiciona contagem e ordena por ela
    if (orderByCount) {
      const result = await db.select({
        store: dealsTable.store,
        count: sql`COUNT(${dealsTable.store})`.as('count'),
      })
        .from(dealsTable)
        .where(isNotNull(dealsTable.store))
        .groupBy(dealsTable.store)
        .orderBy(desc(sql`count`));

      return result
        .map(row => row.store as string)
        .filter(Boolean);
    }

    // Caso contrário, ordena alfabeticamente
    const result = await db.select({ store: dealsTable.store })
      .from(dealsTable)
      .where(isNotNull(dealsTable.store))
      .groupBy(dealsTable.store)
      .orderBy(dealsTable.store);

    return result
      .map(row => row.store as string)
      .filter(Boolean);
  }

  /**
   * Cria um novo deal
   */
  async create(data: NewDeal): Promise<Deal> {
    const [result] = await db.insert(dealsTable).values(data);
    const insertId = Number(result.insertId);

    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, insertId));

    return this.parseDeal(deal);
  }

  /**
   * Lista deals ordenados por timestamp (mais recentes primeiro)
   */
  async findAll(limit = 32): Promise<Deal[]> {
    const deals = await db.select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Busca deal por ID
   */
  async findById(id: number): Promise<Deal | null> {
    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id));

    return deal ? this.parseDeal(deal) : null;
  }

  /**
   * Verifica se deal já existe (deduplicação)
   * Equivalente ao keyOf(chat, id) do Next.js
   */
  async exists(chat: string, messageId: number): Promise<boolean> {
    const [deal] = await db.select({ id: dealsTable.id })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.chat, chat),
          eq(dealsTable.messageId, messageId),
        ),
      )
      .limit(1);

    return !!deal;
  }

  /**
   * Atualiza o caminho local da imagem quando o download termina
   * Chamado pelo webhook /api/deals/image
   * @returns Deal atualizado ou null se não encontrado
   */
  async updateImage(photoId: string, localPath: string): Promise<Deal | null> {
    const result = await db.update(dealsTable)
      .set({ localPath })
      .where(eq(dealsTable.photoId, photoId));

    if (result[0].affectedRows === 0) {
      return null;
    }

    // Buscar deal atualizado
    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.photoId, photoId));

    return deal ? this.parseDeal(deal) : null;
  }

  /**
   * Busca deals por canal
   */
  async findByChat(chat: string, limit = 100): Promise<Deal[]> {
    const deals = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.chat, chat))
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Conta total de deals
   */
  async count(): Promise<number> {
    const [result] = await db.select({ count: dealsTable.id })
      .from(dealsTable);

    return Number(result?.count || 0);
  }

  /**
   * Lista deals com cursor-based pagination (para infinite scroll)
   * @param limit - Número de itens a retornar
   * @param cursor - Timestamp do último deal carregado (opcional)
   * @returns Deals mais antigos que o cursor, ordenados do mais recente ao mais antigo
   */
  async findAllPaginated(limit: number, cursor?: Date): Promise<Deal[]> {
    const query = db.select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    if (cursor) {
      query.where(lt(dealsTable.ts, cursor));
    }

    const deals = await query;
    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Lista deals por chat com cursor-based pagination
   * @param chat - Nome do canal
   * @param limit - Número de itens a retornar
   * @param cursor - Timestamp do último deal carregado (opcional)
   * @returns Deals mais antigos que o cursor, ordenados do mais recente ao mais antigo
   */
  async findByChatPaginated(chat: string, limit: number, cursor?: Date): Promise<Deal[]> {
    const conditions = cursor
      ? and(eq(dealsTable.chat, chat), lt(dealsTable.ts, cursor))
      : eq(dealsTable.chat, chat);

    const deals = await db.select()
      .from(dealsTable)
      .where(conditions)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Busca deals com filtros avançados
   * @param params - Parâmetros de busca e filtros
   * @returns Deals que correspondem aos filtros, ordenados por data (mais recente primeiro)
   */
  async findWithFilters(params: {
    limit: number;
    cursor?: Date;
    search?: string;
    stores?: string[];
    hasCoupon?: boolean;
  }): Promise<Deal[]> {
    const conditions = [];

    // Cursor para paginação
    if (params.cursor) {
      conditions.push(lt(dealsTable.ts, params.cursor));
    }

    // Busca de texto em múltiplos campos (case-insensitive)
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        or(
          sql`${dealsTable.text} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.product} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.description} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.store} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
        ),
      );
    }

    // Filtro por múltiplas lojas (busca parcial, case-insensitive)
    // Ex: "Magalu" encontra "Magalu no Aliexpress"
    if (params.stores && params.stores.length > 0) {
      conditions.push(
        or(...params.stores.map(store =>
          sql`${dealsTable.store} LIKE ${`%${store}%`} COLLATE utf8mb4_unicode_ci`,
        )),
      );
    }

    // Filtro de cupom
    if (params.hasCoupon !== undefined) {
      if (params.hasCoupon) {
        conditions.push(isNotNull(dealsTable.coupons));
      } else {
        conditions.push(isNull(dealsTable.coupons));
      }
    }

    const deals = await db.select()
      .from(dealsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dealsTable.ts))
      .limit(params.limit);

    return deals.map(deal => this.parseDeal(deal));
  }
}

export default DealService;
