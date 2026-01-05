export interface TelegramAuthPrompts {
  phoneNumber(): Promise<string>;
  password(): Promise<string>;
  phoneCode(): Promise<string>;
  onError(err: unknown): void;
}

export interface TelegramAuthConfig {
  apiId: number;
  apiHash: string;
  sessionString: string;
}

export interface TelegramAuthResult {
  sessionString: string;
}

export interface TelegramAuthProvider {
  authenticate(config: TelegramAuthConfig, prompts: TelegramAuthPrompts): Promise<TelegramAuthResult>;
}
