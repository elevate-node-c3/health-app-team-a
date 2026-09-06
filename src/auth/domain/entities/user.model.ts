import { Exclude } from 'class-transformer';

import { Gender } from '../enums/user.enum';

export class User {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
    public phone: string,
    public gender: Gender,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    private readonly password: string,
  ) {}

  getPasswordHash(): string {
    return this.password;
  }
}
