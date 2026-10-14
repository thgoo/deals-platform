import type { ExtractRequest, ExtractResponse } from '../schemas';
import type { Logger } from '~/logger';
import type { LLMProvider } from '~/providers/llm/types';
import type { ChatMessage } from '~/shared/types';
import { AIParsingError } from '~/shared/errors';
import { EXTRACTION_SYSTEM_PROMPT } from '../prompts/system-prompt';
import { extractionSchema } from '../schemas';

const CACHE_KEY = 'bargah-extraction';

export default class ExtractOrchestrator {
  constructor(
    private readonly llm: LLMProvider,
    private readonly logger: Logger,
  ) {}

  async extract(input: ExtractRequest): Promise<ExtractResponse> {
    const { messageId, chat, text } = input;
    const start = Date.now();

    this.logger.info('Extraction started', {
      messageId,
      chat,
      textLength: text.length,
      provider: this.llm.name,
    });

    const messages = this.buildMessages(input);
    const rawContent = await this.llm.chat(messages, {
      responseFormat: 'json_object',
      temperature: 0,
      maxTokens: 1024,
      cacheKey: CACHE_KEY,
    });

    const result = this.parseResponse(rawContent, text);

    this.logger.info('Extraction completed', {
      messageId,
      provider: this.llm.name,
      durationMs: Date.now() - start,
      hasProduct: result.product !== null,
      hasStore: result.store !== null,
      hasPrice: result.price !== null,
      couponsCount: result.coupons.length,
      category: result.category,
    });

    return result;
  }

  getStrategy(): { primary: string } {
    return { primary: `ai-${this.llm.name}` };
  }

  private buildMessages(input: ExtractRequest): ChatMessage[] {
    const linksContext = input.links.length > 0
      ? `\n\n[Links expandidos: ${input.links.join(', ')}]`
      : '';

    return [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: input.text + linksContext },
    ];
  }

  private parseResponse(content: string, fallbackText: string): ExtractResponse {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // LLM occasionally omits the text field despite prompt instructions
      if (!parsed['text']) parsed['text'] = fallbackText;

      const result = extractionSchema.safeParse(parsed);
      if (!result.success) {
        throw new AIParsingError(
          `Invalid AI response structure: ${JSON.stringify(result.error.issues)}`,
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIParsingError) throw error;
      throw new AIParsingError(
        `Failed to parse AI response: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
