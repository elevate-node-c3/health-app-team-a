import dataSource from '../data-source';

import { seedArticles } from './articles.seed';
import { seedAvailability } from './availability.seed';
import { reportSeedFailure } from './seed-runner';
import { seedSlotHold } from './slot-hold.seed';
import { seedUsers } from './users.seed';

/**
 * Deterministic order: users first (`seedAvailability`'s demo appointments
 * attach to a known seed user by email), then the two catalog/demo fixtures
 * — order between those two doesn't matter, they own disjoint fixed-id
 * ranges — then articles last, since it's fully independent of everything
 * else here.
 */
async function run(): Promise<void> {
  await dataSource.initialize();
  try {
    await seedUsers();
    await seedAvailability();
    await seedSlotHold();
    await seedArticles();
  } finally {
    await dataSource.destroy();
  }
}

run().catch(reportSeedFailure);
