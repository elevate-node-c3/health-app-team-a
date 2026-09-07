import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';

import { User } from './domain/entities/user.model';

export interface UserCredentials {
  user: User;
  decoded: IDecodedJwtPayload;
}
