import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Api, TelegramClient } from 'telegram';
import  { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import type { DealPayload } from './types';
import { extractWithService } from './extractor-client';
import { rewriteLinks, type AffiliateConfig } from './link-rewriter';
import {
  extractLinks,
  describeMedia,
  postWebhook,
  downloadAndNotify,
  cleanPromoText,
  generateCouponFallbackLinks,
} from './utils';

// ============================================================================
// CONFIG
// ============================================================================

const API_ID = parseInt(process.env.TG_API_ID || '0');
const API_HASH = process.env.TG_API_HASH || '';
const SESSION_DIR = process.env.SESSION_DIR || './sessions';
const SESSION_NAME = process.env.SESSION_NAME || 'deal_session';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:8000/api/deals';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'devsecret';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';
const EXTRACTOR_SERVICE_URL = process.env.EXTRACTOR_SERVICE_URL || 'http://localhost:3001/api/extractors/extract';
const TARGET_CHATS_ENV = process.env.TARGET_CHATS || '';
const TARGET_CHATS = TARGET_CHATS_ENV.split(',').map(c => c.trim()).filter(Boolean);

const AFFILIATE_CONFIG: AffiliateConfig = {
  amazon: process.env.AMAZON_AFFILIATE_TAG,
  shopee: process.env.SHOPEE_AFFILIATE_ID,
  mercadolivre: process.env.MERCADOLIVRE_AFFILIATE_ID,
  aliexpress: process.env.ALIEXPRESS_AFFILIATE_ID,
  magalu: process.env.MAGALU_AFFILIATE_ID,
  natura: process.env.NATURA_AFFILIATE_ID,
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('[INIT] Starting telegram-crawler...');
  console.log(`[CONFIG] API_ID: ${API_ID}`);
  console.log(`[CONFIG] SESSION_DIR: ${SESSION_DIR}`);
  console.log(`[CONFIG] WEBHOOK_URL: ${WEBHOOK_URL}`);
  console.log(`[CONFIG] EXTRACTOR_SERVICE_URL: ${EXTRACTOR_SERVICE_URL}`);
  console.log(`[CONFIG] TARGET_CHATS: ${TARGET_CHATS.join(', ')}`);

  if (TARGET_CHATS.length === 0) {
    console.error('[ERROR] TARGET_CHATS is empty. Set @channel1,@channel2,... in environment.');
    process.exit(1);
  }

  // Create session directory
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  // Load or create session
  const sessionPath = path.join(SESSION_DIR, `${SESSION_NAME}.session`);
  let sessionString = '';
  try {
    sessionString = await fs.readFile(sessionPath, 'utf-8');
  } catch {
    console.log('[SESSION] Creating new session...');
  }

  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });
  client.setLogLevel(LogLevel.INFO);

  await client.connect();
  console.log('[TELEGRAM] Connected to Telegram API');

  const isAuthorized = await client.isUserAuthorized();
  if (!isAuthorized) {
    console.log('[AUTH] Not authorized. Please run setup first.');
    process.exit(1);
  }
  console.log('[AUTH] User authorized');

  // Save session
  const newSessionString = client.session.save();
  if (typeof newSessionString === 'string') {
    await fs.writeFile(sessionPath, newSessionString, 'utf-8');
  }

  const newMessageEventHandler = async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      const peerId = message.peerId;
      if (!(peerId instanceof Api.PeerChannel)) return;

      const chatId = peerId.channelId;
      if (!chatId) return;

      const entity = await client.getEntity(chatId);
      const chatAlias = entity.className === 'Channel' ? entity.username || '' : entity.id.toString();

      const rawText = message.message || '';
      const text = cleanPromoText(rawText);
      const links = extractLinks(message);
      const serverTs = new Date(message.date * 1000);
      const receivedTs = new Date();
      const latencyS = (receivedTs.getTime() - serverTs.getTime()) / 1000;

      const rewrittenLinks = await rewriteLinks(links.slice(0, 5), AFFILIATE_CONFIG);

      console.log('[NEW]' +
        ` ${chatAlias}` +
        ` #${message.id}` +
        ` server=${serverTs.toISOString()}` +
        ` latency=${latencyS.toFixed(1)}s` +
        ` links=${links.length}` +
        ` text_len=${text.length}`,
      );

      // Rule: require any link OR 'r$' in text
      if (!links.length && !text.toLowerCase().includes('r$')) {
        return;
      }

      // Extract using AI service
      let extraction;
      try {
        extraction = await extractWithService(
          EXTRACTOR_SERVICE_URL,
          text,
          chatAlias,
          message.id,
          rewrittenLinks,
        );
        console.log('[EXTRACT] AI extraction successful');
      } catch (error) {
        console.error('[EXTRACT] Failed to extract:', error instanceof Error ? error.message : 'Unknown error');
        return; // Skip message if extraction fails
      }

      // Se há cupom mas não há links de produto, adiciona link de fallback
      let finalLinks = rewrittenLinks;
      if (extraction.coupons.length > 0 && rewrittenLinks.length === 0) {
        const fallbackLinks = generateCouponFallbackLinks(extraction.store, AFFILIATE_CONFIG);
        if (fallbackLinks.length > 0) {
          finalLinks = fallbackLinks;
          console.log(`[COUPON-FALLBACK] Added fallback link for ${extraction.store}`);
        }
      }

      const payload: DealPayload = {
        message_id: message.id,
        chat: chatAlias,
        chat_id: chatId.toString(),
        ts: serverTs.toISOString(),
        text,
        links: finalLinks,
        price: extraction.price ?? undefined,
        coupons: extraction.coupons.length > 0 ? extraction.coupons : undefined,
        store: extraction.store,
        description: extraction.description,
        product: extraction.product,
      };

      // Add media info if present
      if (message.media
        && (
          message.media instanceof Api.MessageMediaPhoto
          || message.media instanceof Api.MessageMediaDocument
          || message.media instanceof Api.MessageMediaWebPage)
      ) {
        try {
          const mediaInfo = describeMedia(message.media);

          payload.media = mediaInfo;

          if (mediaInfo.type !== 'photo') return;

          if (mediaInfo.photo_id && (peerId.channelId)) {
            downloadAndNotify(
              client,
              mediaInfo.photo_id,
              message.id,
              chatId.toString(),
              MEDIA_DIR,
              WEBHOOK_URL,
              WEBHOOK_SECRET,
            ).catch(console.error);
          }
        } catch {
          console.error(`✗ Error processing media for ${chatAlias} #${message.id}`);
        }
      }

      await postWebhook(payload, WEBHOOK_URL, WEBHOOK_SECRET);
      console.log(`[WEBHOOK] OK -> ${chatAlias} #${message.id}`);
    } catch (error) {
      console.error('[ERROR] Error handling message:', error);
    }
  };

  client.addEventHandler(
    newMessageEventHandler,
    new NewMessage({ chats: TARGET_CHATS }),
  );

  console.log('[READY] Crawler running. Press Ctrl+C to exit.');
}

main().catch(console.error);
