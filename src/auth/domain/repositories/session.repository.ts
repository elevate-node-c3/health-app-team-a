import { Session } from 'src/auth/domain/entities/session.model';
import { Token } from 'src/auth/domain/entities/token.model';
import { User } from 'src/auth/domain/entities/user.model';
import { TokenType } from 'src/auth/domain/enums/token.enum';

export interface CreateSessionInput {
  id: string;
  userId: string;
  deviceInfo: string | null;
  expiresAt: Date;
}

export interface CreateTokenInput {
  userId: string;
  sessionId: string;
  type: TokenType;
  jti: string;
  expiresAt: Date;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

export interface SessionRepository {
  /**
   * A session on its own. Pairing it with its refresh token is the caller's
   * job, inside a unit of work — see `AuthUnitOfWork`. This method used to be
   * `createSessionWithToken` and opened its own transaction, which put the
   * transaction boundary inside a repository instead of at the use case.
   */
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionWithUser(id: string): Promise<SessionWithUser | null>;
  createToken(input: CreateTokenInput): Promise<Token>;
  findTokenByJti(jti: string): Promise<Token | null>;
  revokeToken(jti: string): Promise<void>;
  /**
   * Revokes a session's tokens and the session itself. Two writes, so callers
   * must run it inside a unit of work or a crash between them leaves the
   * tokens revoked and the session live.
   */
  revokeSession(sessionId: string): Promise<void>;
  /** Two writes, same caveat as `revokeSession`. */
  revokeAllUserSessions(userId: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
