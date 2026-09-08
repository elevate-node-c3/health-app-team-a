import { Session } from 'src/auth/domain/entities/session.model';
import { Token } from 'src/auth/domain/entities/token.model';
import { SessionOrmEntity } from 'src/auth/infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from 'src/auth/infrastructure/entities/typeorm/token.entity';

export class SessionMapper {
  static toDomain(ormEntity: SessionOrmEntity): Session {
    return new Session(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.deviceInfo,
      ormEntity.revoked,
      ormEntity.expiresAt,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}

export class TokenMapper {
  static toDomain(ormEntity: TokenOrmEntity): Token {
    return new Token(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.sessionId,
      ormEntity.type,
      ormEntity.jtiHash,
      ormEntity.revoked,
      ormEntity.expiresAt,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
