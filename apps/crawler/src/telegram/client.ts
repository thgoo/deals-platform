import * as fs from 'fs/promises';
import * as path from 'path';
import { Api, TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { logger } from '../logger';
import { AuthError } from '../shared/errors';

export interface TelegramMessage {
  id: number;
  peerId: Api.TypePeer;
  message: string;
  date: number;
  media?: Api.TypeMessageMedia;
  entities?: Api.TypeMessageEntity[];
}

export type MessageHandler = (message: TelegramMessage) => Promise<void>;

class TelegramClientService {
  private client: TelegramClient | null = null;
  private messageHandler: MessageHandler | null = null;

  async initialize(
    apiId: number,
    apiHash: string,
    sessionDir: string,
    sessionName: string,
    targetChats: string[],
  ): Promise<void> {
    logger.info('Initializing Telegram client...', { apiId, sessionDir });

    await fs.mkdir(sessionDir, { recursive: true });

    const sessionPath = path.join(sessionDir, `${sessionName}.session`);
    let sessionString = '';
    try {
      sessionString = await fs.readFile(sessionPath, 'utf-8');
    } catch {
      logger.info('Creating new session...');
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
      await fs.writeFile(sessionPath, newSessionString, 'utf-8');
    }

    this.client.addEventHandler(
      this.handleNewMessage.bind(this),
      new NewMessage({ chats: targetChats }),
    );
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private async handleNewMessage(event: NewMessageEvent): Promise<void> {
    if (!this.messageHandler) return;

    try {
      const message = event.message;

      const telegramMessage: TelegramMessage = {
        id: message.id,
        peerId: message.peerId,
        message: message.message || '',
        date: message.date,
        media: message.media,
        entities: message.entities,
      };

      await this.messageHandler(telegramMessage);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error handling message', { error: errorMsg });
    }
  }

  async getEntity(chatId: number): Promise<Api.TypeUser | Api.TypeChat> {
    if (!this.client) {
      throw new AuthError('Client not initialized');
    }
    return await this.client.getEntity(chatId);
  }

  getClient(): TelegramClient {
    if (!this.client) {
      throw new AuthError('Client not initialized');
    }
    return this.client;
  }
}

export const telegramClient = new TelegramClientService();
