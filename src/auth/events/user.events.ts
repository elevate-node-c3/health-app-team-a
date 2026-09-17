export class UserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly phone: string,
  ) {}
}

export class UserVerificationCodeIssuedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}

export class UserVerifiedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}
