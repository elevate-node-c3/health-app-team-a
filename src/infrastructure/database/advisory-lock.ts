import type { EntityManager } from 'typeorm';

/**
 * Takes a transaction-scoped PostgreSQL advisory lock.
 *
 * Raw SQL because TypeORM exposes no advisory-lock API at all — this is the
 * case rule 3 exists for. `hashtext` folds the namespaced key into the bigint
 * the lock function takes, and the `_xact_` variant releases at commit or
 * rollback, so there is nothing to unlock and no leak on a thrown error.
 *
 * Serializes writers that contend on a logical key rather than on rows that
 * may not exist yet, which is why row locks cannot do this job: two requests
 * booking the same free instant have no row to lock until one of them inserts.
 *
 * @param namespace Groups keys so unrelated callers cannot collide.
 * @param key       Identifies the contended resource within the namespace.
 */
export async function advisoryXactLock(
  manager: EntityManager,
  namespace: string,
  key: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `${namespace}:${key}`,
  ]);
}
