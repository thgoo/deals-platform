import type { JudgeCandidate, JudgeRequest, JudgeResponse } from '../schemas';
import type { Logger } from '~/logger';
import type { LLMProvider } from '~/providers/llm/types';
import type { ChatMessage } from '~/shared/types';
import { AIParsingError } from '~/shared/errors';
import { JUDGE_SYSTEM_PROMPT } from '../prompts/system-prompt';
import { judgeResponseSchema } from '../schemas';

const CACHE_KEY = 'bargah-judge';

export default class JudgeOrchestrator {
  constructor(
    private readonly llm: LLMProvider,
    private readonly logger: Logger,
  ) {}

  async judge(input: JudgeRequest): Promise<JudgeResponse> {
    const start = Date.now();

    this.logger.info('Judge started', {
      candidateCount: input.candidates.length,
      provider: this.llm.name,
    });

    const messages = this.buildMessages(input);
    const rawContent = await this.llm.chat(messages, {
      responseFormat: 'json_object',
      temperature: 0,
      maxTokens: 128,
      cacheKey: CACHE_KEY,
    });

    const result = this.parseResponse(rawContent, input.candidates);

    this.logger.info('Judge completed', {
      provider: this.llm.name,
      durationMs: Date.now() - start,
      matched: result.matchedId !== null,
      matchedId: result.matchedId,
    });

    return result;
  }

  private buildMessages(input: JudgeRequest): ChatMessage[] {
    const candidateLines = input.candidates
      .map(c => `- [${c.id}] "${c.name}" (similarity ${c.score.toFixed(3)})`)
      .join('\n');

    const userContent = `New product: "${input.newProduct}"
Candidates:
${candidateLines}

Which candidate is the SAME product for price comparison, or null if none?`;

    return [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];
  }

  private parseResponse(content: string, candidates: JudgeCandidate[]): JudgeResponse {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new AIParsingError(
        `Failed to parse judge response: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        error instanceof Error ? error : undefined,
      );
    }

    const result = judgeResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AIParsingError(
        `Invalid judge response structure: ${JSON.stringify(result.error.issues)}`,
      );
    }

    // Guard: LLM may hallucinate an id that isn't in candidates — treat as no match
    if (result.data.matchedId !== null) {
      const validIds = new Set(candidates.map(c => c.id));
      if (!validIds.has(result.data.matchedId)) {
        this.logger.warn('Judge returned unknown candidate id; coercing to null', {
          returnedId: result.data.matchedId,
        });
        return { matchedId: null };
      }
    }

    return result.data;
  }
}
