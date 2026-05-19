import type { NotificationChannel, ChannelType, Recipient, Message, SendResult } from './types';

export class NotificationDispatcher {
  private channels = new Map<ChannelType, NotificationChannel>();

  register(channel: NotificationChannel): this {
    this.channels.set(channel.type, channel);
    return this;
  }

  async send(recipient: Recipient, message: Message): Promise<SendResult> {
    const channel = this.channels.get(recipient.type);
    if (!channel) {
      return { ok: false, reason: 'channel_error', error: `Channel '${recipient.type}' not registered` };
    }
    return channel.send(recipient, message);
  }
}
