import { beforeEach, describe, expect, it, mock } from 'bun:test';

const sendNotification = mock(async () => ({}));
const setVapidDetails = mock((..._args: unknown[]) => undefined);
mock.module('web-push', () => ({ default: { sendNotification, setVapidDetails } }));

const { WebPushSender } = await import('./web-push');

const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
const vapid = { email: 'ops@example.com', publicKey: 'pub', privateKey: 'priv' };

describe('WebPushSender', () => {
  beforeEach(() => {
    sendNotification.mockReset();
    setVapidDetails.mockReset();
  });

  it('configures VAPID once, on first send', async () => {
    const sender = new WebPushSender(vapid);
    expect(setVapidDetails).not.toHaveBeenCalled();

    await sender.send(subscription, { title: 't', body: 'b' });
    await sender.send(subscription, { title: 't', body: 'b' });

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.com', 'pub', 'priv');
  });

  it('sends the message as JSON', async () => {
    const result = await new WebPushSender(vapid).send(subscription, { title: 'Deal', body: 'R$ 10' });
    expect(result).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify({ title: 'Deal', body: 'R$ 10' }));
  });

  it.each([404, 410])('maps HTTP %d to recipient_gone', async statusCode => {
    sendNotification.mockImplementation(async () => { throw Object.assign(new Error('gone'), { statusCode }); });
    const result = await new WebPushSender(vapid).send(subscription, { title: 't', body: 'b' });
    expect(result).toEqual({ ok: false, reason: 'recipient_gone' });
  });

  it('maps other failures to channel_error', async () => {
    sendNotification.mockImplementation(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); });
    const result = await new WebPushSender(vapid).send(subscription, { title: 't', body: 'b' });
    expect(result).toMatchObject({ ok: false, reason: 'channel_error' });
  });
});
