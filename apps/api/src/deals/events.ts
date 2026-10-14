import type { ImageUpdatedEvent } from '@bargah/shared';
import { EventEmitter } from 'events';
import type { Deal } from '~/db/schemas/deals';

/**
 * In-process bus feeding the SSE stream (GET /api/deals/stream). The ingestion
 * worker runs in the same process as the HTTP server, so a plain EventEmitter
 * is enough.
 */
class DealEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(10000);
  }

  newDeal(deal: Deal): void {
    this.emit('new-deal', deal);
  }

  imageUpdated(event: ImageUpdatedEvent): void {
    this.emit('image-updated', event);
  }
}

export const dealEvents = new DealEvents();
