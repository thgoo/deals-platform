import { beforeEach, describe, expect, test } from 'bun:test';
import type { ChatOptions, LLMProvider } from '~/providers/llm/types';
import type { ChatMessage } from '~/shared/types';
import { AIParsingError } from '~/shared/errors';
import JudgeOrchestrator from './judge-orchestrator';

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

const candidates = [
  { id: 'abc-123', name: 'Nvidia RTX 4080 Super 16GB', score: 0.96 },
  { id: 'def-456', name: 'ASUS RTX 4090 24GB', score: 0.81 },
];

describe('JudgeOrchestrator', () => {
  let llm: StubLLM;
  let orchestrator: JudgeOrchestrator;

  beforeEach(() => {
    llm = new StubLLM();
    orchestrator = new JudgeOrchestrator(llm, silentLogger);
  });

  test('returns matchedId when LLM picks a valid candidate', async () => {
    llm.responses.push(JSON.stringify({ matchedId: 'abc-123' }));
    const result = await orchestrator.judge({
      newProduct: 'Galax RTX 4080 Super 16GB',
      candidates,
    });
    expect(result.matchedId).toBe('abc-123');
  });

  test('returns null when LLM finds no match', async () => {
    llm.responses.push(JSON.stringify({ matchedId: null }));
    const result = await orchestrator.judge({
      newProduct: 'iPhone 15 Pro Max 256GB',
      candidates,
    });
    expect(result.matchedId).toBeNull();
  });

  test('coerces hallucinated id (not in candidates) to null', async () => {
    llm.responses.push(JSON.stringify({ matchedId: 'ghi-789' }));
    const result = await orchestrator.judge({
      newProduct: 'whatever',
      candidates,
    });
    expect(result.matchedId).toBeNull();
  });

  test('throws AIParsingError on malformed JSON', async () => {
    llm.responses.push('not json {');
    await expect(orchestrator.judge({ newProduct: 'x', candidates }))
      .rejects.toBeInstanceOf(AIParsingError);
  });

  test('throws AIParsingError on invalid schema', async () => {
    llm.responses.push(JSON.stringify({ unrelatedField: 'oops' }));
    await expect(orchestrator.judge({ newProduct: 'x', candidates }))
      .rejects.toBeInstanceOf(AIParsingError);
  });

  test('sends responseFormat=json_object and a cacheKey to the LLM', async () => {
    llm.responses.push(JSON.stringify({ matchedId: null }));
    await orchestrator.judge({ newProduct: 'x', candidates });
    expect(llm.lastOptions?.responseFormat).toBe('json_object');
    expect(typeof llm.lastOptions?.cacheKey).toBe('string');
    expect(llm.lastOptions?.temperature).toBe(0);
  });
});
