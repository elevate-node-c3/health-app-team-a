import { describe, expect, it, jest } from '@jest/globals';
import { FAVOURITE_ADDED_EVENT } from 'src/infrastructure/messaging/event-names';

import { FavouriteService } from './favourite.service';

function makeHarness(newlyAdded: boolean, doctorName: string | null) {
  const repository = {
    add: jest.fn(() => Promise.resolve(newlyAdded)),
    findDoctorName: jest.fn(() => Promise.resolve(doctorName)),
    remove: jest.fn(() => Promise.resolve()),
  };
  const events = { emit: jest.fn() };
  const service = new FavouriteService(repository as never, events as never);
  return { service, repository, events };
}

describe('FavouriteService.add', () => {
  it('publishes favourite.added when the doctor is newly favourited', async () => {
    const { service, events } = makeHarness(true, 'Dr. Sara');

    await expect(service.add('user-1', 'doctor-1')).resolves.toEqual({
      isFavourite: true,
    });

    expect(events.emit).toHaveBeenCalledWith(FAVOURITE_ADDED_EVENT, {
      userId: 'user-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. Sara',
    });
  });

  it('publishes nothing when the doctor was already a favourite', async () => {
    const { service, events, repository } = makeHarness(false, 'Dr. Sara');

    await service.add('user-1', 'doctor-1');

    expect(events.emit).not.toHaveBeenCalled();
    expect(repository.findDoctorName).not.toHaveBeenCalled();
  });
});
