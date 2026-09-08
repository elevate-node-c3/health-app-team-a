import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { SessionOrmEntity } from './infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from './infrastructure/entities/typeorm/token.entity';
import { UserOrmEntity } from './infrastructure/entities/typeorm/user.entity';
import { TypeOrmSessionRepository } from './infrastructure/repositories/session.repository';
import { TypeOrmUserRepository } from './infrastructure/repositories/user.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserOrmEntity, SessionOrmEntity, TokenOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
  ],
  exports: [USER_REPOSITORY, SESSION_REPOSITORY],
})
export class AuthModule {}
