import { describe, expect, it } from 'bun:test';
import { ZodError } from 'zod';
import { ConsoleLogger } from '~/logger';
import { InProcessAiService } from './ai-service';

// .env.test has no AI keys: any call that reaches a provider factory fails with
// "Missing environment variable". Validation errors must come first.
const ai = () => new InProcessAiService(new ConsoleLogger());

describe('InProcessAiService', () => {
  it('can be constructed without API keys', () => {
    expect(ai).not.toThrow();
  });

  it('validates extract input before touching a provider', async () => {
    await expect(ai().extract({ text: '', chat: 'c', messageId: 1, links: [] })).rejects.toBeInstanceOf(ZodError);
    await expect(ai().extract({ text: 't', chat: 'c', messageId: 1, links: ['not a url'] })).rejects.toBeInstanceOf(ZodError);
  });

  it('validates embed and judge input before touching a provider', async () => {
    await expect(ai().embed([])).rejects.toBeInstanceOf(ZodError);
    await expect(ai().judge('x', [])).rejects.toBeInstanceOf(ZodError);
  });

  it('fails with a clear message when a key is missing', async () => {
    await expect(ai().embed(['ssd 1tb'])).rejects.toThrow('OPENAI_API_KEY');
  });
});
