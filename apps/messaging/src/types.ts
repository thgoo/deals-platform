import type { PushSubscription } from 'web-push';

export type ChannelType = 'web-push';

export type Recipient = {
  type: 'web-push';
  subscription: PushSubscription;
};

export interface NotificationAction {
  action: string;
  title: string;
}

export interface Message {
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  tag?: string;
  renotify?: boolean;
  actions?: NotificationAction[];
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'recipient_gone' | 'channel_error'; error?: string };

export interface NotificationChannel {
  readonly type: ChannelType;
  send(recipient: Recipient, message: Message): Promise<SendResult>;
}
