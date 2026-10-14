import type { DealPayload } from '@bargah/shared';
import type { AiService } from '~/ai/ai-service';
import type AlertService from '~/alerts/services/alert-service';
import type { Deal } from '~/db/schemas/deals';
import type { IngestStep, RawMessage } from '~/db/schemas/raw-messages';
import type { dealEvents as DealEventsInstance } from '~/deals/events';
import type DealService from '~/deals/services/deal-service';
import type LinkPipelineService from '~/link-pipeline/services/link-pipeline-service';
import type { ExternalId } from '~/link-pipeline/types';
import type { Logger } from '~/logger';
import type DecisionService from '~/products/services/decision-service';
import type ProductResolverService from '~/products/services/product-resolver-service';
import { cleanPromoText } from '~/deals/text-cleaner';

export type StepResult =
  | { kind: 'next'; next: IngestStep; dealId?: number; externalIds?: ExternalId[]; outcome?: 'deal' }
  | { kind: 'skip'; reason: string; dealId?: number };

export interface PipelineDeps {
  deals: Pick<DealService, 'create' | 'findById' | 'findByMessage' | 'updateImage' | 'updateProductId'>;
  links: Pick<LinkPipelineService, 'process'>;
  ai: Pick<AiService, 'extract'>;
  resolver: Pick<ProductResolverService, 'resolve'>;
  decisions: Pick<DecisionService, 'exists'>;
  alerts: Pick<AlertService, 'matchAndNotify'>;
  /** Re-reads a raw message (to pick up a photo that arrived during extraction). */
  findRawMessage: (id: number) => Promise<Pick<RawMessage, 'photoPath'> | null>;
  events: Pick<typeof DealEventsInstance, 'newDeal' | 'imageUpdated'>;
  logger: Logger;
}

/**
 * The deal ingestion steps, formerly run inline in POST /api/deals. Each step
 * is safe to run again after a crash: extract links to an existing deal instead
 * of creating a second one, resolve is skipped once a match decision exists.
 */
export default class IngestPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  run(step: IngestStep, row: RawMessage): Promise<StepResult> {
    switch (step) {
      case 'extract': return this.extract(row);
      case 'resolve': return this.resolve(row);
      case 'notify': return this.notify(row);
      case 'done': throw new Error('Nothing to run for a finished message');
    }
  }

  /** Link pipeline + AI extraction → deal. */
  async extract(row: RawMessage): Promise<StepResult> {
    const { deals, links, ai, events, logger } = this.deps;
    const body: DealPayload = row.payload;
    const ctx = { rawId: row.id, chat: body.chat, messageId: body.message_id };

    // Messages ingested before this queue existed (or by an earlier run of this
    // step that crashed after creating the deal) already have a deal.
    const existing = await deals.findByMessage(body.chat, body.message_id);
    if (existing) {
      logger.info('Message already has a deal, not processing again', { ...ctx, dealId: existing.id });
      return { kind: 'skip', reason: 'already-ingested', dealId: existing.id };
    }

    const cleanedText = cleanPromoText(body.text);
    const knownLinks = body.links ?? [];

    // Heuristic: a message with no link (either in body.links or inline in the text)
    // AND no money-like number is almost never a deal. Skipping it here avoids paying
    // for link-pipeline + AI extraction on noise.
    //
    // Reason for checking the text directly:
    //   - body.links carries Telegram's MessageEntity-parsed URLs only. Channels that
    //     paste a bare URL after an emoji (e.g. "🔗 https://...") often don't get the
    //     entity, so body.links is empty even though the text has a real link.
    //   - The price check used to require "R$" but many channels write Brazilian
    //     prices without the prefix ("DE 207,04 | POR 55,90"). Detect any decimal-2
    //     pattern instead, which covers all common cases without false positives.
    const hasLink = knownLinks.length > 0 || /https?:\/\//i.test(cleanedText);
    const hasMoneyLike = /\b\d+[,.]\d{2}\b/.test(cleanedText);
    if (!hasLink && !hasMoneyLike) {
      logger.info('Message has no link and no money-like pattern, skipping', ctx);
      return { kind: 'skip', reason: 'no-links-no-price' };
    }

    const linkResult = await links.process({ text: cleanedText, knownLinks });

    // Throws on provider failure; the worker retries the step with backoff.
    const extraction = await ai.extract({
      text: cleanedText,
      chat: body.chat,
      messageId: body.message_id,
      links: linkResult.allVersions,
    });

    // Second-level filter: even when the AI returned a result, if it found no
    // product, no price, AND no coupon, the message is not a deal — channel
    // chatter, off-topic, links to neutral sites. Persisting these would pollute
    // the feed and risk firing alert notifications against irrelevant text.
    const hasCommercialSignal = extraction.product !== null
      || extraction.price !== null
      || extraction.coupons.length > 0;
    if (!hasCommercialSignal) {
      logger.info('AI returned no product, price, or coupon — skipping (not a deal)', ctx);
      return { kind: 'skip', reason: 'not-a-deal' };
    }

    // Coupon-only deals (no product extracted, only coupons) use a branded image
    // instead of whatever photo the Telegram channel attached — the channel's
    // photo is usually generic chatter or off-topic. The late-arriving Telegram
    // photo notification is ignored by `updateImage` because local_path is set.
    const isCouponOnly = extraction.product === null && extraction.coupons.length > 0;
    const localPath = isCouponOnly ? 'coupon.png' : (body.media?.local_path ?? row.photoPath ?? undefined);

    let deal = await deals.create({
      messageId: body.message_id,
      chat: body.chat,
      chatId: body.chat_id,
      ts: new Date(body.ts),
      text: cleanedText,
      links: linkResult.finalLinks,
      price: extraction.price,
      coupons: extraction.coupons,
      store: extraction.store,
      description: extraction.description,
      product: extraction.product,
      category: extraction.category,
      mediaType: body.media?.type,
      photoId: body.media?.photo_id !== undefined ? String(body.media.photo_id) : undefined,
      localPath,
    });

    if (!deal) {
      // A concurrent run created it between the check above and the insert.
      const raced = await deals.findByMessage(body.chat, body.message_id);
      return { kind: 'skip', reason: 'already-ingested', dealId: raced?.id };
    }

    logger.info('Deal created', { ...ctx, dealId: deal.id });
    events.newDeal(deal);

    deal = await this.attachLatePhoto(deal, row.id);

    return { kind: 'next', next: 'resolve', dealId: deal.id, externalIds: linkResult.externalIds };
  }

  /** Product matching. Runs one message at a time (see IngestWorker), so two deals
   *  for the same new product can't both create it. */
  async resolve(row: RawMessage): Promise<StepResult> {
    const { deals, resolver, decisions, logger } = this.deps;
    const deal = row.dealId ? await deals.findById(row.dealId) : null;
    if (!deal) return { kind: 'skip', reason: 'deal-deleted' };

    if (await decisions.exists(deal.id)) {
      logger.info('Deal already resolved, skipping to alerts', { rawId: row.id, dealId: deal.id });
      return { kind: 'next', next: 'notify' };
    }

    const result = await resolver.resolve({
      dealId: deal.id,
      product: deal.product,
      category: deal.category,
      externalIds: row.externalIds ?? [],
    });
    if (result.productId) {
      await deals.updateProductId(deal.id, result.productId);
    }
    return { kind: 'next', next: 'notify' };
  }

  /** Keyword alerts — after resolution, so the price gate can be per product. */
  async notify(row: RawMessage): Promise<StepResult> {
    const { deals, alerts, logger } = this.deps;
    const deal = row.dealId ? await deals.findById(row.dealId) : null;
    if (!deal) return { kind: 'skip', reason: 'deal-deleted' };

    await alerts.matchAndNotify(deal, logger);
    return { kind: 'next', next: 'done', outcome: 'deal' };
  }

  /**
   * The photo notification can land while extraction runs (after this row was
   * read, before the deal existed). It was stored on the raw message, so apply it.
   */
  private async attachLatePhoto(deal: Deal, rawId: number): Promise<Deal> {
    if (deal.localPath || !deal.photoId) return deal;
    const raw = await this.deps.findRawMessage(rawId);
    if (!raw?.photoPath) return deal;

    const updated = await this.deps.deals.updateImage(deal.photoId, raw.photoPath);
    if (!updated) return deal;
    this.deps.events.imageUpdated({ id: updated.id, localPath: updated.localPath });
    return updated;
  }
}
