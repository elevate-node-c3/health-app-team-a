import { TokenType } from 'src/auth/domain/enums/token.enum';

export class Token {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly sessionId: string,
    public readonly type: TokenType,
    public readonly jtiHash: string,
    public revoked: boolean,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isUsable(now: Date = new Date()): boolean {
    return !this.revoked && this.expiresAt.getTime() > now.getTime();
  }
}
