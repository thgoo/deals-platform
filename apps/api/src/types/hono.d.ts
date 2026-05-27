import type AiServiceClient from '~/ai-service-client';
import type AlertService from '~/alerts/services/alert-service';
import type PasswordService from '~/auth/services/password-service';
import type SessionService from '~/auth/services/session-service';
import type UserService from '~/auth/services/user-service';
import type { Session, User } from '~/db/schemas';
import type DealService from '~/deals/services/deal-service';
import type LinkPipelineService from '~/link-pipeline/services/link-pipeline-service';
import type { Logger } from '~/logger';
import type ProductResolverService from '~/products/services/product-resolver-service';

declare module 'hono' {
  interface ContextVariableMap {
    alertService: AlertService;
    userService: UserService;
    sessionService: SessionService;
    passwordService: PasswordService;
    dealService: DealService;
    aiServiceClient: AiServiceClient;
    linkPipelineService: LinkPipelineService;
    productResolverService: ProductResolverService;
    logger: Logger;
    user: User;
    session: Session;
    token: string;
  }
}
