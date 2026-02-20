import type { TelegramAuthProvider } from './auth-provider';
import { mtcuteAuthProvider } from './mtcute-auth-provider';

export function getTelegramAuthProvider(backend: string | undefined): TelegramAuthProvider {
  if (backend === 'mtcute') return mtcuteAuthProvider;

  throw new Error(`Unsupported TELEGRAM_BACKEND: ${backend}`);
}

export * from './auth-provider';
