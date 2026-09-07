import { User } from 'src/auth/domain/entities/user.model';
import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      credentials: {
        user: User;
        decoded: IDecodedJwtPayload;
      };
    }
  }
}
