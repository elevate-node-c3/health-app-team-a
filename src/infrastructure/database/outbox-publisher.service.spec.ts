import { jest } from '@jest/globals';

import { OutboxPublisherService } from './outbox-publisher.service';

import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

interface OutboxRow {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  publishedAt: Date | null;
  createdAt: Date;
}

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'event-1',
    eventName: 'appointment.booked',
    payload: { appointmentId: 'appt-1' },
    publishedAt: null,
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Covers the publish-then-mark contract directly, since that ordering is the
 * whole reason duplicate delivery is possible and must be tolerated
 * downstream: a save that only happens after a confirmed publish, and a
 * publish failure that leaves the row unmarked for the next poll.
 */
describe('OutboxPublisherService', () => {
  function makeHarness(rows: OutboxRow[]) {
    const saved: OutboxRow[] = [];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve(rows)),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
      save: jest.fn((row: OutboxRow) => {
        saved.push({ ...row });
        return Promise.resolve(row);
      }),
    };
    const dataSource = {
      transaction: jest.fn((work: (m: typeof manager) => Promise<void>) =>
        work(manager),
      ),
    };

    const publish = jest.fn<EventPublisher['publishRecorded']>(() =>
      Promise.resolve(undefined),
    );

    const service = new OutboxPublisherService(
      dataSource as never,
      {
        publishRecorded: publish,
      } as never,
    );

    return { service, publish, saved, manager };
  }

  it('publishes each claimed row then marks it published', async () => {
    const row = makeRow();
    const { service, publish, saved } = makeHarness([row]);

    await service.publishPending();

    expect(publish).toHaveBeenCalledWith(
      row.eventName,
      row.id,
      row.payload,
      row.createdAt,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it('publishes rows in order, each only after the previous one is marked', async () => {
    const first = makeRow({ id: 'event-1' });
    const second = makeRow({ id: 'event-2' });
    const order: string[] = [];
    const { service, publish, manager } = makeHarness([first, second]);
    publish.mockImplementation((_name, id) => {
      order.push(`publish:${id}`);
      return Promise.resolve(undefined);
    });
    manager.save.mockImplementation((row: OutboxRow) => {
      order.push(`save:${row.id}`);
      return Promise.resolve(row);
    });

    await service.publishPending();

    expect(order).toEqual([
      'publish:event-1',
      'save:event-1',
      'publish:event-2',
      'save:event-2',
    ]);
  });

  // The crux of publish-then-mark: a row whose publish fails is never saved,
  // so it stays `publishedAt: null` and the next poll picks it up again. The
  // real rollback of any row already saved earlier in the same DB
  // transaction is exercised end-to-end, not here — this is the boundary a
  // unit test can prove.
  it('does not mark a row published when the publish fails', async () => {
    const row = makeRow();
    const { service, publish, saved } = makeHarness([row]);
    publish.mockRejectedValue(new Error('broker unavailable'));

    await expect(service.publishPending()).rejects.toThrow(
      'broker unavailable',
    );

    expect(saved).toHaveLength(0);
  });

  it('does nothing when there are no unpublished rows', async () => {
    const { service, publish, saved } = makeHarness([]);

    await service.publishPending();

    expect(publish).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });
});
