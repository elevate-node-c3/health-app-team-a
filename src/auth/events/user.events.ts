export interface UserRegisteredEvent {
  userId: string;
  email: string;
  phone: string;
}

export interface UserVerificationCodeIssuedEvent {
  userId: string;
  email: string;
}

export interface UserVerifiedEvent {
  userId: string;
  email: string;
}
