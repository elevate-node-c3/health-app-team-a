import type {
  AuthTransactionRepositories,
  AuthUnitOfWork,
} from 'src/auth/domain/repositories/unit-of-work';

/**
 * A unit of work for tests: runs the callback against the stubs it was given
 * and counts the calls, with no database and no transaction.
 *
 * This is the payoff of the port taking repositories rather than an
 * `EntityManager` — a use case's transaction boundary can be asserted with
 * plain mocks. `executions` is what lets a test prove that several writes
 * happened inside **one** boundary rather than several.
 *
 * Lives under `infrastructure/` because it is an adapter like any other, and
 * is excluded from the build by the `*spec*` pattern only when named as a
 * spec - so it is deliberately a plain module that production code never
 * imports.
 */
export class FakeUnitOfWork implements AuthUnitOfWork {
  /** How many separate transactions were opened. */
  public executions = 0;

  constructor(private readonly repositories: AuthTransactionRepositories) {}

  async execute<T>(
    work: (repositories: AuthTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    this.executions += 1;
    return work(this.repositories);
  }
}
