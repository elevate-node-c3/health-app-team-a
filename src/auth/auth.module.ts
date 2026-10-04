import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository';
import { AUTH_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { SessionOrmEntity } from './infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from './infrastructure/entities/typeorm/token.entity';
import { UserOrmEntity } from './infrastructure/entities/typeorm/user.entity';
import { TypeOrmSessionRepository } from './infrastructure/repositories/typeorm-session.repository';
import { TypeOrmUserRepository } from './infrastructure/repositories/typeorm-user.repository';
import { TypeOrmAuthUnitOfWork } from './infrastructure/unit-of-work/typeorm-unit-of-work';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserOrmEntity, SessionOrmEntity, TokenOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    { provide: AUTH_UNIT_OF_WORK, useClass: TypeOrmAuthUnitOfWork },
  ],
  // Exported because AuthenticationGuard revokes a reused refresh token, which
  // is two writes and so needs the same transaction boundary.
  exports: [USER_REPOSITORY, SESSION_REPOSITORY, AUTH_UNIT_OF_WORK],
})
export class AuthModule {}
