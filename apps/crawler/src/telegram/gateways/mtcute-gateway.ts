import { TelegramClient } from '@mtcute/bun';
import type { FileDownloadLocation, MessageEntity } from '@mtcute/bun';
import { MemoryStorage } from '@mtcute/core';
import { Dispatcher } from '@mtcute/dispatcher';
import type { MessageContext } from '@mtcute/dispatcher';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { MediaInfo } from '../../shared/types';
import type {
  TelegramGateway,
  TelegramGatewayInit,
  TelegramIncomingMessage,
  TelegramMessageHandler,
} from './gateway';
import { logger } from '../../logger';
import { AuthError } from '../../shared/errors';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

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

function extractTextLinks(entities: readonly MessageEntity[] | undefined): string[] {
  if (!entities) return [];
  const out: string[] = [];
  for (const entity of entities) {
    if (entity.kind === 'text_link') {
      const params = asRecord(entity.params);
      const url = params?.url;
      if (typeof url === 'string') out.push(url);
    }
  }
  return out;
}

function normalizeMedia(media: unknown): MediaInfo | undefined {
  const rec = asRecord(media);
  if (!rec) return undefined;

  const type = rec.type;

  if (type === 'photo') {
    const id = rec.id;
    const fileId = rec.fileId;
    const uniqueFileId = rec.uniqueFileId;

    const photoId =
      typeof id === 'bigint'
        ? id.toString()
        : typeof id === 'number'
          ? String(id)
          : typeof fileId === 'string'
            ? fileId
            : typeof uniqueFileId === 'string'
              ? uniqueFileId
              : undefined;

    return { type: 'photo', photo_id: photoId };
  }

  if (type === 'document') {
    const id = rec.id;
    const mimeType = rec.mimeType;
    const fileName = rec.fileName;

    const documentId =
      typeof id === 'bigint' ? id.toString() : typeof id === 'number' ? String(id) : undefined;

    return {
      type: 'document',
      document_id: documentId,
      mime_type: typeof mimeType === 'string' ? mimeType : undefined,
      file_name: typeof fileName === 'string' ? fileName : undefined,
    };
  }

  if (type === 'web_page') {
    const webPage = asRecord(rec.webPage) ?? rec;
    const url = webPage.url;
    const title = webPage.title;
    const description = webPage.description;
    return {
      type: 'webpage',
      webpage_url: typeof url === 'string' ? url : undefined,
      webpage_title: typeof title === 'string' ? title : undefined,
      webpage_description: typeof description === 'string' ? description : undefined,
    };
  }

  return { type: 'unknown' };
}

export class MtcuteGateway implements TelegramGateway {
  private tg: TelegramClient | null = null;
  private dp: Dispatcher | null = null;
  private handler: TelegramMessageHandler | null = null;

  async initialize(config: TelegramGatewayInit): Promise<void> {
    const { apiId, apiHash, backend, sessionDir, sessionName, targetChats } = config;

    await fs.mkdir(sessionDir, { recursive: true });

    const sessionPath = path.join(sessionDir, `${sessionName}.${backend}.session`);
    let sessionString = '';
    try {
      sessionString = await fs.readFile(sessionPath, 'utf-8');
    } catch {
      // ok: no session
    }

    if (!sessionString) {
      throw new AuthError('Not authorized. Please run setup first.');
    }

    this.tg = new TelegramClient({
      apiId,
      apiHash,
      storage: new MemoryStorage(),
      logLevel: getMtcuteLogLevel(),
    });

    await this.tg.start({
      session: sessionString || undefined,
    });

    // If start succeeded, export current session and persist
    const exported = await this.tg.exportSession();
    if (exported) {
      await fs.writeFile(sessionPath, exported, 'utf-8');
    }

    this.dp = Dispatcher.for(this.tg);

    // Listen to all messages and filter manually by @username.
    this.dp.onNewMessage(async (ctx: MessageContext) => {
      if (!this.handler) return;
      const chat = ctx.chat;

      // Only chats (groups/supergroups/channels). Ignore private messages.
      if (chat.type !== 'chat') return;

      if (targetChats.length > 0) {
        const username = chat.username ? `@${String(chat.username).replace(/^@/, '')}` : null;
        if (!username) return;
        const normalizedTargets = targetChats.map(t => (t.startsWith('@') ? t : `@${t}`));
        if (!normalizedTargets.includes(username)) return;
      }

      await this.handleNewMessage(ctx);
    });

    logger.info('Connected to Telegram API (mtcute)');
  }

  onMessage(handler: TelegramMessageHandler): void {
    this.handler = handler;
  }

  async resolveChatAlias(chatId: string): Promise<string> {
    if (!this.tg) throw new AuthError('Client not initialized');

    try {
      const chat = await this.tg.getChat(Number(chatId));
      return chat.username || chatId;
    } catch {
      return chatId;
    }
  }

  async downloadMessageMedia(chatId: string, messageId: number): Promise<Uint8Array | Buffer | null> {
    if (!this.tg) throw new AuthError('Client not initialized');

    const messages = await this.tg.getMessages(Number(chatId), messageId);
    const message = messages[0];
    if (!message) return null;

    const media = message.media;
    const rec = asRecord(media);
    const location = rec?.location as FileDownloadLocation | undefined;
    if (!location) return null;

    const buf = await this.tg.downloadAsBuffer(location);
    return Buffer.from(buf);
  }

  private async handleNewMessage(ctx: MessageContext): Promise<void> {
    if (!this.handler) return;

    try {
      const chat = ctx.chat;

      if (chat.type !== 'chat') return;

      const chatId = String(chat.id);
      const chatType = chat.chatType;
      const normalizedChatType = chatType === 'channel' || chatType === 'supergroup' || chatType === 'gigagroup'
        ? 'channel'
        : 'chat';

      const date = ctx.date instanceof Date
        ? Math.floor(ctx.date.getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const incoming: TelegramIncomingMessage = {
        id: ctx.id,
        chat: {
          id: chatId,
          type: normalizedChatType,
        },
        text: ctx.text || '',
        date,
        links: extractTextLinks(ctx.entities),
        media: normalizeMedia(ctx.media),
      };

      if (ctx.media && incoming.media?.type === 'photo' && !incoming.media.photo_id) {
        logger.debug('Received photo media but photo_id is missing (mtcute)');
      }

      await this.handler(incoming);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error handling message (mtcute)', { error: errorMsg });
    }
  }
}

export const mtcuteGateway = new MtcuteGateway();
