import webpush from 'web-push';
import type { PushSubscription } from '~/db/schemas/alerts';

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  tag?: string;
  renotify?: boolean;
  actions?: { action: string; title: string }[];
}

export type PushResult =
  | { ok: true }
  | { ok: false; reason: 'recipient_gone' | 'channel_error'; error?: string };

export interface VapidConfig {
  email: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Sends Web Push notifications (formerly the separate messaging service).
 * VAPID keys are applied on the first send, so constructing this never throws —
 * tests and processes that never push don't need valid keys.
 */
export class WebPushSender {
  private configured = false;

  constructor(private readonly vapid: VapidConfig) {}

  async send(subscription: PushSubscription, message: PushMessage): Promise<PushResult> {
    try {
      if (!this.configured) {
        webpush.setVapidDetails(`mailto:${this.vapid.email}`, this.vapid.publicKey, this.vapid.privateKey);
        this.configured = true;
      }
      await webpush.sendNotification(subscription, JSON.stringify(message));
      return { ok: true };
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        return { ok: false, reason: 'recipient_gone' };
      }
      return { ok: false, reason: 'channel_error', error: String(err) };
    }
  }
}
