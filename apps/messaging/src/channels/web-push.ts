import webpush from 'web-push';
import type { NotificationChannel, Message, Recipient, SendResult } from '../types';

interface VapidConfig {
  email: string;
  publicKey: string;
  privateKey: string;
}

export class WebPushChannel implements NotificationChannel {
  readonly type = 'web-push' as const;

  constructor(config: VapidConfig) {
    webpush.setVapidDetails(
      `mailto:${config.email}`,
      config.publicKey,
      config.privateKey,
    );
  }

  async send(recipient: Recipient, message: Message): Promise<SendResult> {
    if (recipient.type !== 'web-push') {
      return { ok: false, reason: 'channel_error', error: 'Wrong recipient type' };
    }

    try {
      await webpush.sendNotification(
        recipient.subscription,
        JSON.stringify(message),
      );
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
