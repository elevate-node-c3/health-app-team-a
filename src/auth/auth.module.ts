import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { UserOrmEntity } from './infrastructure/entities/typeorm/user.entity';
import { TypeOrmUserRepository } from './infrastructure/repositories/user.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
  ],
})
export class AuthModule {}
