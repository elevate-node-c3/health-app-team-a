import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Token } from 'src/auth/domain/entities/token.model';
import {
  CreateSessionInput,
  CreateTokenInput,
  SessionRepository,
  SessionWithUser,
} from 'src/auth/domain/repositories/session.repository';
import { SessionOrmEntity } from 'src/auth/infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from 'src/auth/infrastructure/entities/typeorm/token.entity';
import {
  SessionMapper,
  TokenMapper,
} from 'src/auth/infrastructure/mappers/session.mapper';
import { UserMapper } from 'src/auth/infrastructure/mappers/user.mapper';
import { sha256 } from 'src/common/utils/hash.util';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmSessionRepository implements SessionRepository {
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(TokenOrmEntity)
    private readonly tokenRepo: Repository<TokenOrmEntity>,
  ) {}

  async createSessionWithToken(
    session: CreateSessionInput,
    token: CreateTokenInput,
  ): Promise<void> {
    await this.sessionRepo.manager.transaction(async (manager) => {
      await manager.insert(SessionOrmEntity, session);
      await manager.insert(TokenOrmEntity, this.toTokenRow(token));
    });
  }

  async findSessionWithUser(id: string): Promise<SessionWithUser | null> {
    const ormEntity = await this.sessionRepo.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!ormEntity?.user) return null;

    return {
      session: SessionMapper.toDomain(ormEntity),
      user: UserMapper.toDomain(ormEntity.user),
    };
  }

  async createToken(input: CreateTokenInput): Promise<Token> {
    const ormEntity = this.tokenRepo.create(this.toTokenRow(input));
    return TokenMapper.toDomain(await this.tokenRepo.save(ormEntity));
  }

  async findTokenByJti(jti: string): Promise<Token | null> {
    const ormEntity = await this.tokenRepo.findOneBy({ jtiHash: sha256(jti) });
    return ormEntity ? TokenMapper.toDomain(ormEntity) : null;
  }

  async revokeToken(jti: string): Promise<void> {
    await this.tokenRepo.update({ jtiHash: sha256(jti) }, { revoked: true });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.tokenRepo.update({ sessionId }, { revoked: true });
    await this.sessionRepo.update({ id: sessionId }, { revoked: true });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.tokenRepo.update({ userId }, { revoked: true });
    await this.sessionRepo.update({ userId }, { revoked: true });
  }

  private toTokenRow({ jti, ...rest }: CreateTokenInput) {
    return { ...rest, jtiHash: sha256(jti) };
  }
}
