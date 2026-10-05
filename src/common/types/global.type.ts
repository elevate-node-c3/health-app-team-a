import { UserCredentials } from 'src/auth/auth.type';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      credentials: UserCredentials;
      /**
       * The mode resolved by `AuthenticationGuard`, so handlers need not
       * recompute it. Optional because the fully public routes run no guard;
       * read it through `accessLevelOf`, which treats absence as a guest.
       */
      accessLevel?: AccessLevel;
      /**
       * Persistent anonymous visitor id, assigned by `AuthenticationGuard`
       * for every request (guest or authenticated) that runs it. Optional
       * because fully public routes run no guard.
       */
      deviceId?: string;
    }
  }
}
