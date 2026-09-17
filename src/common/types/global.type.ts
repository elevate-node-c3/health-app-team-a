import { UserCredentials } from 'src/auth/auth.type';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      credentials: UserCredentials;
    }
  }
}
