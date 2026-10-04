import type { SessionRepository } from 'src/auth/domain/repositories/session.repository';
import type { UserRepository } from 'src/auth/domain/repositories/user.repository';

/**
 * The repositories an auth use case may use inside one transaction.
 *
 * Only the two auth owns — a module declares what it needs rather than sharing
 * one app-wide bundle, so auth never names a repository it does not touch.
 */
export interface AuthTransactionRepositories {
  users: UserRepository;
  sessions: SessionRepository;
}

/**
 * Runs a block of repository work as a single atomic unit.
 *
 * The callback is handed **ports**, never a driver handle: no `EntityManager`,
 * no `DataSource`, no `QueryRunner` appears anywhere in this file. That is what
 * keeps the application layer unable to reach TypeORM even by accident, and
 * what lets a use case be tested with plain stubs and no database.
 *
 * Whatever `work` returns is returned through, so a use case can produce a
 * value from inside the transaction. Throwing from `work` rolls everything
 * back — the only way to abort.
 *
 * Use it when two or more writes must succeed or fail together. A single write
 * needs no transaction and should call its repository directly.
 */
export interface AuthUnitOfWork {
  execute<T>(
    work: (repositories: AuthTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}

export const AUTH_UNIT_OF_WORK = Symbol('AUTH_UNIT_OF_WORK');
