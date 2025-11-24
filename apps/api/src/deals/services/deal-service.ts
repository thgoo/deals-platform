import { and, desc, eq, lt } from 'drizzle-orm';
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
}

export default DealService;
