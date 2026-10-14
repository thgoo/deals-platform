import type { DealPayload as DealPayloadContract, MediaPayload } from '@bargah/shared';

/** What the crawler POSTs to the api — the contract lives in @bargah/shared. */
export type DealPayload = DealPayloadContract;

/** Media as the crawler produces it: a narrower version of the shared MediaPayload. */
export interface MediaInfo extends MediaPayload {
  type: 'photo' | 'document' | 'webpage' | 'unknown';
  photo_id?: string;
}
