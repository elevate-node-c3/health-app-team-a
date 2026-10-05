import dataSource from '../data-source';

/**
 * Standard lifecycle for a seed script invoked directly via `npm run seed:x`:
 * initialize the shared DataSource, run `fn`, then always close it — so each
 * seed file's own CLI entry point is one line instead of three, and the same
 * seed function can also be called by `run-all.ts` against an already
 * initialized DataSource without double-initializing it.
 */
export async function runSeedCli(fn: () => Promise<void>): Promise<void> {
  await dataSource.initialize();
  try {
    await fn();
  } finally {
    await dataSource.destroy();
  }
}

export function reportSeedFailure(error: unknown): never {
  console.error(error);
  process.exit(1);
}
