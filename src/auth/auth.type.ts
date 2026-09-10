import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';

import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';

export interface UserCredentials {
  user: User;
  session: Session;
  decoded: IDecodedJwtPayload;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
