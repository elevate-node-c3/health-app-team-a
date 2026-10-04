import { jest } from '@jest/globals';

import { TypeOrmAuthUnitOfWork } from './typeorm-unit-of-work';

import type { AuthTransactionRepositories } from 'src/auth/domain/repositories/unit-of-work';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * The one property that makes a unit of work a unit of work: every repository
 * handed to the callback is built from the *same* transactional manager. If a
 * future edit injects a singleton repository into the bundle instead, the
 * repositories silently run outside the transaction and nothing else in the
 * suite would notice.
 */
describe('TypeOrmAuthUnitOfWork', () => {
  /** Records which entity each `getRepository` call asked for. */
  let requestedEntities: unknown[];
  let transactions: number;
  let manager: EntityManager;
  let dataSource: DataSource;
  let unitOfWork: TypeOrmAuthUnitOfWork;

  beforeEach(() => {
    requestedEntities = [];
    manager = {
      // The sentinel: a repository handle that remembers the manager it came
      // from, so the test can prove all three share one.
      getRepository: jest.fn((entity: unknown) => {
        requestedEntities.push(entity);
        return { __manager: manager, __entity: entity };
      }),
    } as unknown as EntityManager;

    transactions = 0;
    dataSource = {
      transaction: (work: (m: EntityManager) => Promise<unknown>) => {
        transactions += 1;
        return work(manager);
      },
    } as unknown as DataSource;

    unitOfWork = new TypeOrmAuthUnitOfWork(dataSource);
  });

  /** The private `Repository` handles each bundled repository was built with. */
  const handlesOf = (repositories: AuthTransactionRepositories): unknown[] =>
    Object.values(repositories).flatMap((repository) =>
      Object.values(repository as unknown as Record<string, unknown>),
    );

  it('opens exactly one transaction per execute', async () => {
    await unitOfWork.execute(() => Promise.resolve(undefined));

    expect(transactions).toBe(1);
  });

  it('builds every repository in the bundle from the same manager', async () => {
    const handles = await unitOfWork.execute((repositories) =>
      Promise.resolve(handlesOf(repositories)),
    );

    // Users (1 handle) + sessions (2 handles: sessions and tokens).
    expect(handles).toHaveLength(3);
    for (const handle of handles) {
      expect((handle as { __manager: EntityManager }).__manager).toBe(manager);
    }
  });

  // Asserted by class name rather than by importing the entities: they carry
  // mutual relations, and importing both here trips a circular-import TDZ
  // error that says nothing about this class.
  it('resolves each repository against the entity it owns', async () => {
    await unitOfWork.execute(() => Promise.resolve(undefined));

    expect(
      requestedEntities.map((entity) => (entity as { name: string }).name),
    ).toEqual(['UserOrmEntity', 'SessionOrmEntity', 'TokenOrmEntity']);
  });

  it('returns the callback result through the transaction', async () => {
    const result = await unitOfWork.execute(() => Promise.resolve('booked'));

    expect(result).toBe('booked');
  });

  // Rolling back is the only way to abort, so the error must not be swallowed.
  it('propagates a failure so the transaction rolls back', async () => {
    const boom = new Error('write failed');

    await expect(unitOfWork.execute(() => Promise.reject(boom))).rejects.toBe(
      boom,
    );
  });
});
