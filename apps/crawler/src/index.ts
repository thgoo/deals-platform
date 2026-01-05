import { config } from './config';
import { logger } from './logger';
import { messageHandler } from './processing/message-handler';
import { handleError } from './shared/errors';
import { getTelegramGateway } from './telegram';
import { setCurrentTelegramGateway } from './telegram/runtime';

async function main() {
  try {
    logger.info('Starting telegram crawler...');
    logger.info('Configuration', {
      apiId: config.telegram.apiId,
      sessionDir: config.telegram.sessionDir,
      telegramBackend: config.telegram.backend,
      backend: config.backend.baseUrl,
      extractor: config.extractor.baseUrl,
      targetChats: config.targetChats.join(', '),
    });

    if (config.targetChats.length === 0) {
      throw new Error('TARGET_CHATS is empty. Set @channel1,@channel2,... in environment.');
    }

    const telegramGateway = getTelegramGateway(config.telegram.backend);
    setCurrentTelegramGateway(telegramGateway);

    await telegramGateway.initialize({
      apiId: config.telegram.apiId,
      apiHash: config.telegram.apiHash,
      sessionDir: config.telegram.sessionDir,
      sessionName: config.telegram.sessionName,
      targetChats: config.targetChats,
      backend: config.telegram.backend,
    });

    telegramGateway.onMessage(async message => {
      try {
        await messageHandler.handle(message);
      } catch (error) {
        handleError(error);
      }
    });

    logger.info('Crawler running. Press Ctrl+C to exit.');
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
}

main().catch(error => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  logger.error('Fatal error', { error: errorMsg });
  process.exit(1);
});
