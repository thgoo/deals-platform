import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import type {
  TelegramAuthConfig,
  TelegramAuthPrompts,
  TelegramAuthProvider,
  TelegramAuthResult,
} from './auth-provider';
import { AuthError } from '../../shared/errors';

export class GramJsAuthProvider implements TelegramAuthProvider {
  async authenticate(
    config: TelegramAuthConfig,
    prompts: TelegramAuthPrompts,
  ): Promise<TelegramAuthResult> {
    const session = new StringSession(config.sessionString);
    const client = new TelegramClient(session, config.apiId, config.apiHash, {
      connectionRetries: 5,
    });

    await client.start({
      phoneNumber: async () => await prompts.phoneNumber(),
      password: async () => await prompts.password(),
      phoneCode: async () => await prompts.phoneCode(),
      onError: err => prompts.onError(err),
    });

    const isAuthorized = await client.isUserAuthorized();
    if (!isAuthorized) {
      throw new AuthError('Unauthorized');
    }

    const newSessionString = client.session.save();
    if (typeof newSessionString !== 'string') {
      throw new AuthError('Failed to serialize session');
    }

    return { sessionString: newSessionString };
  }
}

export const gramjsAuthProvider = new GramJsAuthProvider();
