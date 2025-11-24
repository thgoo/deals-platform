import { sha256 } from '@oslojs/crypto/sha2';
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import type { SessionValidationResult } from '../types';
import { config } from '~/config';
import { SESSION_DURATION_MS, SESSION_RENEWAL_THRESHOLD_MS } from '~/constants/session';
import db from '~/db';
import { sessionsTable, type Session } from '~/db/schemas/sessions';
import { usersTable } from '~/db/schemas/users';

class SessionService {
  public generateSessionToken(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const token = encodeBase32LowerCaseNoPadding(bytes);

    return token;
  }

  public async createSession(
    token: string,
    userId: number,
  ): Promise<Session> {
    const sessionId = this.getSessionIdFromToken(token);
    const session: Session = {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    };

    await db.insert(sessionsTable).values(session);
    return session;
  }

  public setSessionTokenCookie(
    response: Response,
    token: string,
    expiresAt?: Date,
  ): void {
    const expiresAtString = (
      expiresAt
      || new Date(Date.now() + SESSION_DURATION_MS)
    ).toUTCString();
    if (config.NODE_ENV === 'production') {
      // When deployed over HTTPS
      response.headers.append(
        'Set-Cookie',
        `session=${
          token
        }; HttpOnly; SameSite=Lax; Expires=${
          expiresAtString
        }; Path=/; Secure;`,
      );
    } else {
      // When deployed over HTTP (localhost)
      response.headers.append(
        'Set-Cookie',
        `session=${
          token
        }; HttpOnly; SameSite=Lax; Expires=${
          expiresAtString
        }; Path=/`,
      );
    }
  }

  public async validateSessionToken(
    token: string,
  ): Promise<SessionValidationResult> {
    const sessionId = this.getSessionIdFromToken(token);
    const result = await db
      .select({
        user: {
          id: usersTable.id,
          name: usersTable.name,
          document: usersTable.document,
          email: usersTable.email,
        },
        session: sessionsTable,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(eq(sessionsTable.id, sessionId));

    if (result.length < 1) return { session: null, user: null };

    const { user, session } = result[0];

    if (Date.now() >= session.expiresAt.getTime()) {
      await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
      return { session: null, user: null };
    }

    if (Date.now() >= session.expiresAt.getTime() - SESSION_RENEWAL_THRESHOLD_MS) {
      session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      await db
        .update(sessionsTable)
        .set({
          expiresAt: session.expiresAt,
        })
        .where(eq(sessionsTable.id, session.id));
    }

    return { session, user };
  }

  public async invalidateSession(sessionId: string): Promise<void> {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  }

  public deleteSessionTokenCookie(response: Response): void {
    if (config.NODE_ENV === 'production') {
      // When deployed over HTTPS
      response.headers.append(
        'Set-Cookie',
        'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Secure;',
      );
    } else {
      // When deployed over HTTP
      response.headers.append(
        'Set-Cookie',
        'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/',
      );
    }
  }

  private getSessionIdFromToken(token: string): string {
    const sessionId = encodeHexLowerCase(
      sha256(
        new TextEncoder().encode(token),
      ),
    );
    return sessionId;
  }
}

export default SessionService;
