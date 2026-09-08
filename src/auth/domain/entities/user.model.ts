import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';
import { Gender } from 'src/auth/domain/enums/user.enum';

export class User {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
    public phone: string,
    public gender: Gender,
    public isActive: boolean,
    public isVerified: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    private readonly password: string,
  ) {}

  getPasswordHash(): string {
    return this.password;
  }

  get accessLevel(): AccessLevel {
    return this.isVerified ? AccessLevel.VERIFIED : AccessLevel.UNVERIFIED;
  }
}
