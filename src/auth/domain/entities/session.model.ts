export class Session {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly deviceInfo: string | null,
    public revoked: boolean,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isUsable(now: Date = new Date()): boolean {
    return !this.revoked && this.expiresAt.getTime() > now.getTime();
  }
}
