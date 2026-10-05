import { jest } from '@jest/globals';
import { QueryFailedError } from 'typeorm';

import { TypeOrmProcessedEventRepository } from './typeorm-processed-event.repository';

/** A unique-violation error shaped like the pg driver's. */
function uniqueViolation(): QueryFailedError {
  const error = new QueryFailedError('insert', [], new Error('duplicate key'));
  (error as unknown as { driverError: { code: string } }).driverError = {
    code: '23505',
  };
  return error;
}

describe('TypeOrmProcessedEventRepository', () => {
  function makeHarness() {
    const insert = jest.fn<() => Promise<unknown>>();
    const deleteFn = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
    const repo = { insert, delete: deleteFn };
    const repository = new TypeOrmProcessedEventRepository(repo as never);
    return { repository, insert, delete: deleteFn };
  }

  describe('tryClaim', () => {
    it('returns true when the insert succeeds', async () => {
      const { repository, insert } = makeHarness();
      insert.mockResolvedValue({});

      const claimed = await repository.tryClaim('event-1', 'handler-a');

      expect(claimed).toBe(true);
      expect(insert).toHaveBeenCalledWith({
        eventId: 'event-1',
        handler: 'handler-a',
      });
    });

    // The duplicate-delivery criterion at the storage layer: a second claim
    // for the same key reports false rather than throwing.
    it('returns false when the claim already exists', async () => {
      const { repository, insert } = makeHarness();
      insert.mockRejectedValue(uniqueViolation());

      const claimed = await repository.tryClaim('event-1', 'handler-a');

      expect(claimed).toBe(false);
    });

    it('rethrows any other database error', async () => {
      const { repository, insert } = makeHarness();
      insert.mockRejectedValue(new Error('connection lost'));

      await expect(repository.tryClaim('event-1', 'handler-a')).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('release', () => {
    it('deletes the claim for this event and handler', async () => {
      const { repository, delete: deleteFn } = makeHarness();

      await repository.release('event-1', 'handler-a');

      expect(deleteFn).toHaveBeenCalledWith({
        eventId: 'event-1',
        handler: 'handler-a',
      });
    });
  });
});
