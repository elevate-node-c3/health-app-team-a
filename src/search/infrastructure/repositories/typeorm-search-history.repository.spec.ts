import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { TypeOrmSearchHistoryRepository } from './typeorm-search-history.repository';

import type { SearchHistoryOrmEntity } from 'src/search/infrastructure/entities/typeorm/search-history.entity';

const DEVICE_KEY = 'device:abc';
const USER_KEY = 'user:123';

function makeRow(term: string, id = term): SearchHistoryOrmEntity {
  return {
    id,
    ownerKey: DEVICE_KEY,
    term,
    normalizedTerm: term.toLowerCase(),
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
  };
}

describe('TypeOrmSearchHistoryRepository', () => {
  let repository: TypeOrmSearchHistoryRepository;
  let historyRepo: {
    find: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    historyRepo = {
      find: jest.fn(() => Promise.resolve([])),
      upsert: jest.fn(() => Promise.resolve({})),
      delete: jest.fn(() => Promise.resolve({})),
    };
    repository = new TypeOrmSearchHistoryRepository(historyRepo as never);
  });

  describe('merge', () => {
    // The whole point of the fix: one statement for the device's history
    // rather than a round-trip per term. A regression here is invisible in
    // behaviour and only shows up as latency, so it is asserted on the
    // call count directly.
    it('upserts the whole device history in a single call', async () => {
      const rows = [
        makeRow('cardiology'),
        makeRow('dentist'),
        makeRow('derma'),
      ];
      historyRepo.find.mockImplementation(({ where }: never) =>
        Promise.resolve(
          (where as { ownerKey: string }).ownerKey === DEVICE_KEY ? rows : [],
        ),
      );

      await repository.merge(DEVICE_KEY, USER_KEY, 10);

      expect(historyRepo.upsert).toHaveBeenCalledTimes(1);
      const [values, conflictTarget] = historyRepo.upsert.mock.calls[0] as [
        unknown[],
        string[],
      ];
      expect(values).toHaveLength(rows.length);
      expect(conflictTarget).toEqual(['ownerKey', 'normalizedTerm']);
    });

    it('re-owns every term to the signed-in user, keeping its original time', async () => {
      const row = makeRow('cardiology');
      historyRepo.find.mockImplementation(({ where }: never) =>
        Promise.resolve(
          (where as { ownerKey: string }).ownerKey === DEVICE_KEY ? [row] : [],
        ),
      );

      await repository.merge(DEVICE_KEY, USER_KEY, 10);

      expect(historyRepo.upsert).toHaveBeenCalledWith(
        [
          {
            ownerKey: USER_KEY,
            term: row.term,
            normalizedTerm: row.normalizedTerm,
            createdAt: row.createdAt,
          },
        ],
        ['ownerKey', 'normalizedTerm'],
      );
    });

    // An empty VALUES list is a syntax error rather than a no-op, so the
    // guard is load-bearing for a user who signs in having searched nothing.
    it('issues no upsert when the device has no history', async () => {
      historyRepo.find.mockImplementation(() => Promise.resolve([]));

      await repository.merge(DEVICE_KEY, USER_KEY, 10);

      expect(historyRepo.upsert).not.toHaveBeenCalled();
    });

    it('clears the device history once it has been taken over', async () => {
      historyRepo.find.mockImplementation(() => Promise.resolve([]));

      await repository.merge(DEVICE_KEY, USER_KEY, 10);

      expect(historyRepo.delete).toHaveBeenCalledWith({
        ownerKey: DEVICE_KEY,
      });
    });
  });
});
