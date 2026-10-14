import type { TelegramGateway } from './gateways/gateway';

let currentTelegramGateway: TelegramGateway | null = null;

export function setCurrentTelegramGateway(gateway: TelegramGateway): void {
  currentTelegramGateway = gateway;
}

export function getCurrentTelegramGateway(): TelegramGateway {
  if (!currentTelegramGateway) {
    throw new Error('Telegram gateway not initialized');
  }
  return currentTelegramGateway;
}
