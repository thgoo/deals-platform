// src/types/hono.d.ts
import type PasswordService from '~/auth/services/password-service';
import type SessionService from '~/auth/services/session-service';
import type UserService from '~/auth/services/user-service';
import type { Session, User } from '~/db/schemas';
import type DealService from '~/deals/services/deal-service';
import type { Logger } from '~/logger';

declare module 'hono' {
  interface ContextVariableMap {
    // Services
    userService: UserService;
    sessionService: SessionService;
    passwordService: PasswordService;
    dealService: DealService;
    logger: Logger;

    // Middleware variables
    user: User;
    session: Session;
    token: string;
  }
}
