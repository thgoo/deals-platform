import type { MediaInfo } from '../../shared/types';

export type TelegramChatType = 'channel' | 'chat' | 'user' | 'unknown';

export interface TelegramChatRef {
  id: string;
  username?: string;
  title?: string;
  type: TelegramChatType;
}

export interface TelegramIncomingMessage {
  id: number;
  chat: TelegramChatRef;
  text: string;
  date: number;
  links: string[];
  media?: MediaInfo;
}

export interface TelegramGatewayInit {
  apiId: number;
  apiHash: string;
  sessionDir: string;
  sessionName: string;
  targetChats: string[];
  backend: string;
}

export type TelegramMessageHandler = (message: TelegramIncomingMessage) => Promise<void>;

export interface TelegramGateway {
  initialize(config: TelegramGatewayInit): Promise<void>;
  onMessage(handler: TelegramMessageHandler): void;
  resolveChatAlias(chatId: string): Promise<string>;
  downloadMessageMedia(chatId: string, messageId: number): Promise<Uint8Array | Buffer | null>;
}
