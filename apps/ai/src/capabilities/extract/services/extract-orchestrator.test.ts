import { beforeEach, describe, expect, test } from 'bun:test';
import type { ChatOptions, LLMProvider } from '~/providers/llm/types';
import type { ChatMessage } from '~/shared/types';
import { AIParsingError } from '~/shared/errors';
import ExtractOrchestrator from './extract-orchestrator';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

class StubLLM implements LLMProvider {
  readonly name = 'stub';
  readonly model = 'stub-model';
  responses: string[] = [];
  lastMessages: ChatMessage[] | null = null;
  lastOptions: ChatOptions | null = null;

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    this.lastMessages = messages;
    this.lastOptions = options;
    const next = this.responses.shift();
    if (next === undefined) throw new Error('StubLLM has no queued response');
    return next;
  }
}

const validExtraction = {
  text: 'PlayStation 5 Slim Digital 1TB - R$ 2.849',
  description: 'Pra zerar o backlog.',
  product: 'PlayStation 5 Slim Digital 1TB',
  store: 'Amazon',
  price: 284900,
  coupons: [],
  productKey: 'sony-playstation-5-slim-digital-1tb',
  category: 'games',
};

const baseRequest = {
  text: 'PS5 Slim 1TB R$ 2.849',
  chat: 'promo_channel',
  messageId: 42,
  links: [],
};

describe('ExtractOrchestrator', () => {
  let llm: StubLLM;
  let orchestrator: ExtractOrchestrator;

  beforeEach(() => {
    llm = new StubLLM();
    orchestrator = new ExtractOrchestrator(llm, silentLogger);
  });

  test('happy path returns parsed extraction', async () => {
    llm.responses.push(JSON.stringify(validExtraction));
    const result = await orchestrator.extract(baseRequest);
    expect(result.product).toBe('PlayStation 5 Slim Digital 1TB');
    expect(result.price).toBe(284900);
    expect(result.category).toBe('games');
  });

  test('falls back to input text when LLM omits text field', async () => {
    const { text: _omitted, ...withoutText } = validExtraction;
    llm.responses.push(JSON.stringify(withoutText));
    const result = await orchestrator.extract(baseRequest);
    expect(result.text).toBe(baseRequest.text);
  });

  test('throws AIParsingError on malformed JSON', async () => {
    llm.responses.push('not json {');
    await expect(orchestrator.extract(baseRequest))
      .rejects.toBeInstanceOf(AIParsingError);
  });

  test('throws AIParsingError when LLM response misses required fields', async () => {
    llm.responses.push(JSON.stringify({ text: 'x', description: null }));
    await expect(orchestrator.extract(baseRequest))
      .rejects.toBeInstanceOf(AIParsingError);
  });

  test('passes responseFormat=json_object and cacheKey to the LLM', async () => {
    llm.responses.push(JSON.stringify(validExtraction));
    await orchestrator.extract(baseRequest);
    expect(llm.lastOptions?.responseFormat).toBe('json_object');
    expect(typeof llm.lastOptions?.cacheKey).toBe('string');
    expect(llm.lastOptions?.temperature).toBe(0);
  });

  test('includes links context in user message when links present', async () => {
    llm.responses.push(JSON.stringify(validExtraction));
    await orchestrator.extract({
      ...baseRequest,
      links: ['https://amazon.com.br/dp/B0CL5KNB9M'],
    });
    const userMessage = llm.lastMessages?.find(m => m.role === 'user');
    expect(userMessage?.content).toContain('https://amazon.com.br/dp/B0CL5KNB9M');
  });
});
