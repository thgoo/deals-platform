import * as fs from 'fs/promises';
import * as path from 'path';
import { Api, TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import type { MediaInfo } from '../../shared/types';
import type {
  TelegramGateway,
  TelegramGatewayInit,
  TelegramIncomingMessage,
  TelegramMessageHandler,
} from './gateway';
import { logger } from '../../logger';
import { AuthError } from '../../shared/errors';

function extractTextUrlEntities(entities?: Api.TypeMessageEntity[]): string[] {
  if (!entities) return [];
  const out: string[] = [];
  for (const entity of entities) {
    if (entity instanceof Api.MessageEntityTextUrl) {
      if (entity.url) out.push(entity.url);
    }
  }
  return out;
}

function extractMediaInfo(media?: Api.TypeMessageMedia): MediaInfo | undefined {
  if (!media) return undefined;

  if (media instanceof Api.MessageMediaPhoto) {
    return {
      type: 'photo',
      photo_id: media.photo?.id.toString(),
    };
  }

  if (media instanceof Api.MessageMediaDocument && media.document) {
    const doc = media.document as unknown as {
      id: bigint;
      mimeType?: string;
      attributes?: { className?: string; fileName?: string }[];
    };

    const attributes = doc.attributes || [];
    const fileNameAttr = attributes.find(attr => attr.className === 'DocumentAttributeFilename');

    return {
      type: 'document',
      document_id: doc.id.toString(),
      mime_type: doc.mimeType || undefined,
      file_name: fileNameAttr?.fileName,
    };
  }

  if (media instanceof Api.MessageMediaWebPage && media.webpage) {
    const webpage = media.webpage as unknown as {
      url?: string;
      title?: string;
      description?: string;
    };

    return {
      type: 'webpage',
      webpage_url: webpage.url || undefined,
      webpage_title: webpage.title || undefined,
      webpage_description: webpage.description || undefined,
    };
  }

  return { type: 'unknown' };
}

function getChatRefFromPeer(peerId: Api.TypePeer): {
  id: string;
  type: 'channel' | 'chat' | 'user' | 'unknown';
} {
  if (peerId instanceof Api.PeerChannel) {
    return { id: peerId.channelId.toString(), type: 'channel' };
  }
  if (peerId instanceof Api.PeerChat) {
    return { id: peerId.chatId.toString(), type: 'chat' };
  }
  if (peerId instanceof Api.PeerUser) {
    return { id: peerId.userId.toString(), type: 'user' };
  }
  return { id: 'unknown', type: 'unknown' };
}

export class GramJsGateway implements TelegramGateway {
  private client: TelegramClient | null = null;
  private handler: TelegramMessageHandler | null = null;

  async initialize(config: TelegramGatewayInit): Promise<void> {
    const { apiId, apiHash, backend, sessionDir, sessionName, targetChats } = config;

    logger.info('Initializing Telegram client...', { apiId, sessionDir });

    await fs.mkdir(sessionDir, { recursive: true });

    const backendSessionPath = path.join(sessionDir, `${sessionName}.${backend}.session`);
    const legacySessionPath = path.join(sessionDir, `${sessionName}.session`);
    let sessionString = '';
    try {
      sessionString = await fs.readFile(backendSessionPath, 'utf-8');
    } catch {
      if (backend === 'gramjs') {
        try {
          sessionString = await fs.readFile(legacySessionPath, 'utf-8');
        } catch {
          logger.info('Creating new session...');
        }
      } else {
        logger.info('Creating new session...');
      }
    }

    const session = new StringSession(sessionString);
    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });
    this.client.setLogLevel(LogLevel.INFO);

    await this.client.connect();
    logger.info('Connected to Telegram API');

    const isAuthorized = await this.client.isUserAuthorized();
    if (!isAuthorized) {
      throw new AuthError('Not authorized. Please run setup first.');
    }
    logger.info('User authorized');

    const newSessionString = this.client.session.save();
    if (typeof newSessionString === 'string') {
      await fs.writeFile(backendSessionPath, newSessionString, 'utf-8');
    }

    this.client.addEventHandler(
      this.handleNewMessage.bind(this),
      new NewMessage({ chats: targetChats }),
    );
  }

  onMessage(handler: TelegramMessageHandler): void {
    this.handler = handler;
  }

  async resolveChatAlias(chatId: string): Promise<string> {
    if (!this.client) throw new AuthError('Client not initialized');

    try {
      const entity = await this.client.getEntity(Number(chatId));
      if (entity.className === 'Channel') {
        const username = (entity as unknown as { username?: string }).username;
        return username || chatId;
      }
      return chatId;
    } catch {
      return chatId;
    }
  }

  async downloadMessageMedia(
    chatId: string,
    messageId: number,
  ): Promise<Uint8Array | Buffer | null> {
    if (!this.client) throw new AuthError('Client not initialized');

    const messages = await this.client.getMessages(parseInt(chatId, 10), { ids: messageId });
    const message = Array.isArray(messages) ? messages[0] : messages;
    if (!message || !message.media) return null;

    const downloaded = await this.client.downloadMedia(message);
    if (!downloaded || typeof downloaded === 'string') return null;
    return downloaded;
  }

  private async handleNewMessage(event: NewMessageEvent): Promise<void> {
    if (!this.handler) return;

    try {
      const message = event.message;
      const peer = getChatRefFromPeer(message.peerId);

      const incoming: TelegramIncomingMessage = {
        id: message.id,
        chat: {
          id: peer.id,
          type: peer.type,
        },
        text: message.message || '',
        date: message.date,
        links: extractTextUrlEntities(message.entities),
        media: extractMediaInfo(message.media),
      };

      await this.handler(incoming);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error handling message', { error: errorMsg });
    }
  }
}

export const gramjsGateway = new GramJsGateway();
