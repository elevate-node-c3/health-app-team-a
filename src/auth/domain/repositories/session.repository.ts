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
  createSessionWithToken(
    session: CreateSessionInput,
    token: CreateTokenInput,
  ): Promise<void>;
  findSessionWithUser(id: string): Promise<SessionWithUser | null>;
  createToken(input: CreateTokenInput): Promise<Token>;
  findTokenByJti(jti: string): Promise<Token | null>;
  revokeToken(jti: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
