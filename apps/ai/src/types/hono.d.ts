import type EmbedOrchestrator from '~/capabilities/embed/services/embed-orchestrator';
import type ExtractOrchestrator from '~/capabilities/extract/services/extract-orchestrator';
import type JudgeOrchestrator from '~/capabilities/judge/services/judge-orchestrator';
import type { Logger } from '~/logger';

declare module 'hono' {
  interface ContextVariableMap {
    extractOrchestrator: ExtractOrchestrator;
    embedOrchestrator: EmbedOrchestrator;
    judgeOrchestrator: JudgeOrchestrator;
    logger: Logger;
  }
}
