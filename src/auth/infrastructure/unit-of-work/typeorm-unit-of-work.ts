import { Injectable } from '@nestjs/common';
import { SessionOrmEntity } from 'src/auth/infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from 'src/auth/infrastructure/entities/typeorm/token.entity';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { TypeOrmSessionRepository } from 'src/auth/infrastructure/repositories/typeorm-session.repository';
import { TypeOrmUserRepository } from 'src/auth/infrastructure/repositories/typeorm-user.repository';
import { DataSource } from 'typeorm';

import type {
  AuthTransactionRepositories,
  AuthUnitOfWork,
} from 'src/auth/domain/repositories/unit-of-work';

/**
 * The TypeORM half of `AuthUnitOfWork`, and the only place in the auth module
 * that may call `DataSource.transaction`.
 *
 * Every repository in the bundle is constructed from the **same** `manager`,
 * which is what makes them one transaction rather than several. Building them
 * per call rather than injecting the singletons is deliberate: the injected
 * instances are bound to the default connection and would each open their own
 * transaction, which is the failure this class exists to prevent.
 *
 * Constructing a repository per transaction is cheap — they are thin wrappers
 * over a `Repository<T>` handle and hold no state between calls.
 */
@Injectable()
export class TypeOrmAuthUnitOfWork implements AuthUnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  execute<T>(
    work: (repositories: AuthTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work({
        users: new TypeOrmUserRepository(manager.getRepository(UserOrmEntity)),
        sessions: new TypeOrmSessionRepository(
          manager.getRepository(SessionOrmEntity),
          manager.getRepository(TokenOrmEntity),
        ),
      }),
    );
  }
}
