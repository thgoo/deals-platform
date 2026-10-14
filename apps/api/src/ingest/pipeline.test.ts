import type { DealPayload } from '@bargah/shared';
import { beforeEach, describe, expect, it } from 'bun:test';
import type { PipelineDeps } from './pipeline';
import type { ExtractInput, ExtractResponse } from '~/ai/ai-service';
import type { Deal, NewDeal } from '~/db/schemas/deals';
import type { RawMessage } from '~/db/schemas/raw-messages';
import IngestPipeline from './pipeline';
import { backoffSeconds } from './raw-message-service';

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

function payload(overrides: Partial<DealPayload> = {}): DealPayload {
  return {
    message_id: 42,
    chat: 'promos',
    chat_id: '1',
    ts: '2026-10-14T12:00:00.000Z',
    text: 'SSD Kingston 1TB por R$ 399,90 https://www.amazon.com.br/dp/B0BBWH1R8H',
    links: [],
    ...overrides,
  };
}

function raw(overrides: Partial<RawMessage> = {}): RawMessage {
  const p = overrides.payload ?? payload();
  return {
    id: 7,
    chat: p.chat,
    messageId: p.message_id,
    payload: p,
    photoId: null,
    photoPath: null,
    step: 'extract',
    outcome: null,
    skipReason: null,
    dealId: null,
    externalIds: null,
    attempts: 1,
    lastError: null,
    availableAt: new Date(),
    lockedUntil: null,
    receivedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const extraction = (overrides: Partial<ExtractResponse> = {}): ExtractResponse => ({
  text: 'x',
  description: null,
  product: 'SSD Kingston 1TB',
  store: 'Amazon',
  price: 39990,
  coupons: [],
  category: 'hardware',
  ...overrides,
});

class Fakes {
  existingDeal: Deal | null = null;
  created: NewDeal[] = [];
  createReturnsNull = false;
  deals = new Map<number, Deal>();
  extractResult = extraction();
  extractCalls: ExtractInput[] = [];
  decisionExists = false;
  resolved: { dealId: number }[] = [];
  productIdUpdates: [number, string][] = [];
  notified: number[] = [];
  newDealEvents: number[] = [];
  imageEvents: number[] = [];
  rawPhotoPath: string | null = null;

  deps(): PipelineDeps {
    return {
      deals: {
        findByMessage: async () => this.existingDeal,
        findById: async id => this.deals.get(id) ?? null,
        create: async data => {
          this.created.push(data);
          if (this.createReturnsNull) return null;
          const deal = { id: 100, ...data, photoId: data.photoId ?? null, localPath: data.localPath ?? null } as Deal;
          this.deals.set(deal.id, deal);
          return deal;
        },
        updateImage: async (_photoId, localPath) => {
          const deal = this.deals.get(100);
          if (!deal) return null;
          const updated = { ...deal, localPath };
          this.deals.set(100, updated);
          return updated;
        },
        updateProductId: async (id, productId) => {
          this.productIdUpdates.push([id, productId]);
        },
      },
      links: {
        process: async () => ({
          finalLinks: ['https://www.amazon.com.br/dp/B0BBWH1R8H?tag=x'],
          allVersions: ['https://www.amazon.com.br/dp/B0BBWH1R8H'],
          externalIds: [{ source: 'amazon', externalId: 'B0BBWH1R8H' }],
        }),
      },
      ai: {
        extract: async input => {
          this.extractCalls.push(input);
          return this.extractResult;
        },
      },
      resolver: {
        resolve: async input => {
          this.resolved.push({ dealId: input.dealId });
          return { productId: 'p-1', method: 'created_new' };
        },
      },
      decisions: { exists: async () => this.decisionExists },
      alerts: {
        matchAndNotify: async deal => {
          this.notified.push(deal.id);
        },
      },
      findRawMessage: async () => ({ photoPath: this.rawPhotoPath }),
      events: {
        newDeal: deal => this.newDealEvents.push(deal.id),
        imageUpdated: event => this.imageEvents.push(event.id),
      },
      logger: silent,
    };
  }
}

describe('IngestPipeline.extract', () => {
  let f: Fakes;
  let pipeline: IngestPipeline;
  beforeEach(() => {
    f = new Fakes();
    pipeline = new IngestPipeline(f.deps());
  });

  it('creates the deal and moves to resolve with the external ids', async () => {
    const result = await pipeline.extract(raw());
    expect(result).toEqual({
      kind: 'next',
      next: 'resolve',
      dealId: 100,
      externalIds: [{ source: 'amazon', externalId: 'B0BBWH1R8H' }],
    });
    expect(f.created[0]).toMatchObject({ chat: 'promos', messageId: 42, price: 39990, product: 'SSD Kingston 1TB' });
    expect(f.newDealEvents).toEqual([100]);
  });

  it('does not process a message that already has a deal', async () => {
    f.existingDeal = { id: 55 } as Deal;
    expect(await pipeline.extract(raw())).toEqual({ kind: 'skip', reason: 'already-ingested', dealId: 55 });
    expect(f.extractCalls).toHaveLength(0);
  });

  it('skips noise: no link and no price-like number', async () => {
    const r = raw({ payload: payload({ text: 'Bom dia, grupo!' }) });
    expect(await pipeline.extract(r)).toEqual({ kind: 'skip', reason: 'no-links-no-price' });
    expect(f.extractCalls).toHaveLength(0);
  });

  it('skips when the AI finds no product, price or coupon', async () => {
    f.extractResult = extraction({ product: null, price: null, coupons: [] });
    expect(await pipeline.extract(raw())).toEqual({ kind: 'skip', reason: 'not-a-deal' });
    expect(f.created).toHaveLength(0);
  });

  it('gives coupon-only deals the branded coupon image', async () => {
    f.extractResult = extraction({ product: null, price: null, coupons: [{ code: 'OFF10', discount: undefined }] });
    await pipeline.extract(raw({ photoPath: 'media/channel-photo.jpg' }));
    expect(f.created[0]?.localPath).toBe('coupon.png');
  });

  it('uses a photo that arrived before the deal was created', async () => {
    await pipeline.extract(raw({ photoPath: 'media/abc.jpg' }));
    expect(f.created[0]?.localPath).toBe('media/abc.jpg');
  });

  it('applies a photo that arrived while extraction was running', async () => {
    f.rawPhotoPath = 'media/late.jpg';
    await pipeline.extract(raw({ payload: payload({ media: { type: 'photo', photo_id: 'ph1' } }) }));
    expect(f.deals.get(100)?.localPath).toBe('media/late.jpg');
    expect(f.imageEvents).toEqual([100]);
  });

  it('links to the existing deal when a concurrent run created it first', async () => {
    f.createReturnsNull = true;
    f.existingDeal = null;
    const deps = f.deps();
    let calls = 0;
    deps.deals.findByMessage = async () => (calls++ === 0 ? null : ({ id: 77 } as Deal));
    const result = await new IngestPipeline(deps).extract(raw());
    expect(result).toEqual({ kind: 'skip', reason: 'already-ingested', dealId: 77 });
  });

  it('lets AI errors propagate so the worker retries the step', async () => {
    const deps = f.deps();
    deps.ai.extract = async () => {
      throw new Error('provider down');
    };
    await expect(new IngestPipeline(deps).extract(raw())).rejects.toThrow('provider down');
  });
});

describe('IngestPipeline.resolve / notify', () => {
  let f: Fakes;
  let pipeline: IngestPipeline;
  beforeEach(() => {
    f = new Fakes();
    f.deals.set(100, { id: 100, product: 'SSD', category: 'hardware' } as Deal);
    pipeline = new IngestPipeline(f.deps());
  });

  it('resolves the deal and stores its product', async () => {
    const result = await pipeline.resolve(raw({ step: 'resolve', dealId: 100, externalIds: [] }));
    expect(result).toEqual({ kind: 'next', next: 'notify' });
    expect(f.resolved).toEqual([{ dealId: 100 }]);
    expect(f.productIdUpdates).toEqual([[100, 'p-1']]);
  });

  it('skips matching when a decision already exists (retried step)', async () => {
    f.decisionExists = true;
    expect(await pipeline.resolve(raw({ step: 'resolve', dealId: 100 }))).toEqual({ kind: 'next', next: 'notify' });
    expect(f.resolved).toHaveLength(0);
  });

  it('finishes when the deal was deleted in the meantime', async () => {
    const result = await pipeline.resolve(raw({ step: 'resolve', dealId: 999 }));
    expect(result).toEqual({ kind: 'skip', reason: 'deal-deleted' });
  });

  it('notifies alerts and finishes with a deal outcome', async () => {
    const result = await pipeline.notify(raw({ step: 'notify', dealId: 100 }));
    expect(result).toEqual({ kind: 'next', next: 'done', outcome: 'deal' });
    expect(f.notified).toEqual([100]);
  });
});

describe('backoffSeconds', () => {
  it('doubles from 30 s and caps at 15 min', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(backoffSeconds)).toEqual([30, 60, 120, 240, 480, 900, 900]);
  });
});
