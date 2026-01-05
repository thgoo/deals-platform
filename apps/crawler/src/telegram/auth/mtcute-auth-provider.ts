import { TelegramClient } from '@mtcute/bun';
import { MemoryStorage } from '@mtcute/core';
import type {
  TelegramAuthConfig,
  TelegramAuthPrompts,
  TelegramAuthProvider,
  TelegramAuthResult,
} from './auth-provider';
import { AuthError } from '../../shared/errors';

function getMtcuteLogLevel(): number {
  // mtcute LogManager levels:
  // OFF=0, ERROR=1, WARN=2, INFO=3, DEBUG=4, VERBOSE=5
  const LOG_OFF = 0;
  const LOG_ERROR = 1;
  const LOG_WARN = 2;
  const LOG_INFO = 3;
  const LOG_DEBUG = 4;
  const LOG_VERBOSE = 5;

  const level = (process.env.LOG_LEVEL || '').toLowerCase();
  if (level === 'error') return LOG_ERROR;
  if (level === 'warn' || level === 'warning') return LOG_WARN;
  if (level === 'info') return LOG_INFO;
  if (level === 'debug') return LOG_DEBUG;
  if (level === 'verbose' || level === 'trace') return LOG_VERBOSE;
  if (level === 'off' || level === 'silent') return LOG_OFF;

  return process.env.NODE_ENV === 'production' ? LOG_WARN : LOG_INFO;
}

export class MtcuteAuthProvider implements TelegramAuthProvider {
  async authenticate(
    config: TelegramAuthConfig,
    prompts: TelegramAuthPrompts,
  ): Promise<TelegramAuthResult> {
    const tg = new TelegramClient({
      apiId: config.apiId,
      apiHash: config.apiHash,
      storage: new MemoryStorage(),
      logLevel: getMtcuteLogLevel(),
    });

    await tg.start({
      phone: async () => await prompts.phoneNumber(),
      code: async () => await prompts.phoneCode(),
      password: async () => await prompts.password(),
      session: config.sessionString || undefined,
      codeSentCallback: () => {
        // noop; setup.ts already prompts for code
      },
      invalidCodeCallback: async () => {
        // noop; mtcute will ask again by calling `code`/`password`
      },
    });

    const sessionString = await tg.exportSession();
    if (!sessionString) {
      throw new AuthError('Failed to export mtcute session');
    }

    return { sessionString };
  }
}

export const mtcuteAuthProvider = new MtcuteAuthProvider();
