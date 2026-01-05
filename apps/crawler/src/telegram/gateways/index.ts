import type { TelegramGateway } from './gateway';
import { gramjsGateway } from './gramjs-gateway';
import { mtcuteGateway } from './mtcute-gateway';

export function getTelegramGateway(backend: string | undefined): TelegramGateway {
  if (!backend || backend === 'gramjs') return gramjsGateway;
  if (backend === 'mtcute') return mtcuteGateway;

  throw new Error(`Unsupported TELEGRAM_BACKEND: ${backend}`);
}

export * from './gateway';
