import { jest } from '@jest/globals';
import { User } from 'src/auth/domain/entities/user.model';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { Doctor } from 'src/doctor/domain/entities/doctor.model';
import { Specialty } from 'src/doctor/domain/entities/specialty.model';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { VisibleDoctor } from 'src/doctor/domain/repositories/doctor.repository';
import { HOME_OPENED_EVENT } from 'src/infrastructure/messaging/event-names';

import { HomeService } from './home.service';

import type { AppointmentCard } from 'src/appointment/domain/repositories/appointment.repository';

function makeUser(
  overrides: Partial<{ id: string; name: string; isVerified: boolean }> = {},
): User {
  return new User(
    overrides.id ?? 'user-1',
    overrides.name ?? 'Nour',
    'nour@example.com',
    '+201000000000',
    Gender.FEMALE,
    true,
    overrides.isVerified ?? true,
    new Date(),
    new Date(),
    'hash',
  );
}

function makeVisibleDoctor(
  id: string,
  ratingCount: number,
  cardPrice: number | null,
): VisibleDoctor {
  const doctor = new Doctor(
    id,
    `Doctor ${id}`,
    null,
    DoctorTitle.SPECIALIST,
    'spec-1',
    null,
    'Cairo Uni',
    10,
    100,
    4.5,
    ratingCount,
    Gender.MALE,
    true,
    new Date(),
    new Date(),
  );
  return { doctor, cardPrice };
}

function makeAppointmentCard(id: string): AppointmentCard {
  return {
    id,
    scheduledAt: new Date('2026-10-01T10:00:00Z'),
    doctorId: 'doc-1',
    doctorName: 'Doctor doc-1',
    doctorPhoto: null,
    specialtyName: 'Cardiology',
    clinicName: 'Nile Clinic',
  };
}

describe('HomeService', () => {
  let specialtyRepository: { findAll: jest.Mock };
  let doctorRepository: { findTopRanked: jest.Mock };
  let appointmentRepository: {
    findNextUpcoming: jest.Mock;
    findMostRecentVisit: jest.Mock;
  };
  let favouriteRepository: { findFavouritedDoctorIds: jest.Mock };
  let articleService: { newestTeasers: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let events: { emit: jest.Mock };
  let notificationRepository: { hasUnread: jest.Mock };
  let service: HomeService;

  // Fixed "now" for deterministic appointment-window queries.
  const now = new Date('2026-09-19T06:00:00Z');

  beforeEach(() => {
    specialtyRepository = {
      findAll: jest
        .fn<() => Promise<Specialty[]>>()
        .mockResolvedValue([
          new Specialty('spec-1', 'Cardiology', new Date(), new Date()),
        ]),
    };
    doctorRepository = {
      findTopRanked: jest
        .fn<() => Promise<VisibleDoctor[]>>()
        .mockResolvedValue([
          makeVisibleDoctor('doc-1', 3, 250),
          makeVisibleDoctor('doc-2', 0, null),
        ]),
    };
    appointmentRepository = {
      findNextUpcoming: jest
        .fn<() => Promise<AppointmentCard | null>>()
        .mockResolvedValue(null),
      findMostRecentVisit: jest
        .fn<() => Promise<AppointmentCard | null>>()
        .mockResolvedValue(null),
    };
    favouriteRepository = {
      findFavouritedDoctorIds: jest
        .fn<() => Promise<Set<string>>>()
        .mockResolvedValue(new Set<string>()),
    };
    articleService = {
      newestTeasers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    };
    cache = {
      get: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
      set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn() };
    notificationRepository = {
      hasUnread: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    };

    service = new HomeService(
      specialtyRepository as never,
      doctorRepository as never,
      appointmentRepository as never,
      favouriteRepository as never,
      articleService as never,
      cache as never,
      events as never,
      notificationRepository as never,
    );
  });

  describe('guest', () => {
    it('omits the user name and all personal sections (BR-03)', async () => {
      const home = await service.getHome(null, now);

      expect(home).not.toHaveProperty('userName');
      expect(home).not.toHaveProperty('upcomingAppointment');
      expect(home).not.toHaveProperty('recentVisit');
      expect(home.topDoctors[0]).not.toHaveProperty('isFavourite');
      expect(appointmentRepository.findNextUpcoming).not.toHaveBeenCalled();
      expect(
        favouriteRepository.findFavouritedDoctorIds,
      ).not.toHaveBeenCalled();
    });

    it('shapes doctor cards with EGP fee and rating gated by hasRatings (BR-08)', async () => {
      const home = await service.getHome(null, now);

      expect(home.topDoctors[0]).toMatchObject({
        id: 'doc-1',
        specialty: 'Cardiology',
        fee: 250,
        feeCurrency: 'EGP',
        rating: { average: 4.5, count: 3 },
      });
      // doc-2 has no ratings and no active fee.
      expect(home.topDoctors[1].rating).toBeNull();
      expect(home.topDoctors[1].fee).toBeNull();
    });
  });

  describe('signed-in', () => {
    it('returns the user name and stamps favourite state (BR-06)', async () => {
      favouriteRepository.findFavouritedDoctorIds.mockResolvedValue(
        new Set(['doc-1']),
      );

      const home = await service.getHome(makeUser({ name: 'Nour' }), now);

      expect(home.userName).toBe('Nour');
      expect(home.topDoctors[0].isFavourite).toBe(true);
      expect(home.topDoctors[1].isFavourite).toBe(false);
    });

    it('includes upcoming appointment only when present (BR-04)', async () => {
      appointmentRepository.findNextUpcoming.mockResolvedValue(
        makeAppointmentCard('appt-1'),
      );

      const home = await service.getHome(makeUser(), now);

      expect(home.upcomingAppointment).toMatchObject({
        id: 'appt-1',
        doctor: { name: 'Doctor doc-1', specialty: 'Cardiology' },
        clinicName: 'Nile Clinic',
      });
      expect(home).not.toHaveProperty('recentVisit');
    });

    it('reports whether the user has unread notifications', async () => {
      notificationRepository.hasUnread.mockResolvedValue(true);

      const home = await service.getHome(makeUser({ id: 'user-7' }), now);

      expect(home.hasUnreadNotifications).toBe(true);
      expect(notificationRepository.hasUnread).toHaveBeenCalledWith('user-7');
    });

    it('omits the appointment section entirely when there is none (edge case 2/4)', async () => {
      const home = await service.getHome(makeUser(), now);
      expect(home).not.toHaveProperty('upcomingAppointment');
      expect(home).not.toHaveProperty('recentVisit');
    });
  });

  // Personalization keys off the presence of a user, never off `isVerified`.
  // An unverified user may perform no action a guest cannot, but the extra
  // profile information they supplied is exactly what earns them the richer
  // journey - so Home must read identically for both signed-in modes. If this
  // ever diverges, an authorization rule has leaked into presentation.
  describe('unverified users get the same personalization as verified ones', () => {
    it('returns the name and favourite flags for an unverified user', async () => {
      favouriteRepository.findFavouritedDoctorIds.mockResolvedValue(
        new Set(['doc-1']),
      );

      const home = await service.getHome(
        makeUser({ name: 'Nour', isVerified: false }),
        now,
      );

      expect(home.userName).toBe('Nour');
      expect(home.topDoctors[0].isFavourite).toBe(true);
    });

    it('builds an identical response for a verified and an unverified user', async () => {
      favouriteRepository.findFavouritedDoctorIds.mockResolvedValue(
        new Set(['doc-1']),
      );
      appointmentRepository.findNextUpcoming.mockResolvedValue(
        makeAppointmentCard('appt-1'),
      );

      const verified = await service.getHome(
        makeUser({ isVerified: true }),
        now,
      );
      const unverified = await service.getHome(
        makeUser({ isVerified: false }),
        now,
      );

      expect(unverified).toEqual(verified);
    });
  });

  describe('caching (BR-09)', () => {
    it('serves the public block from cache without recomputing', async () => {
      const cachedBlock = {
        categories: [],
        topDoctors: [],
        articles: [],
      };
      cache.get.mockResolvedValue(cachedBlock);

      await service.getHome(null, now);

      expect(specialtyRepository.findAll).not.toHaveBeenCalled();
      expect(doctorRepository.findTopRanked).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('computes and caches the public block on a miss', async () => {
      await service.getHome(null, now);
      expect(cache.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('analytics', () => {
    it('emits HomeOpened with a null userId and the given time for a guest', async () => {
      await service.getHome(null, now);

      expect(events.emit).toHaveBeenCalledWith(HOME_OPENED_EVENT, {
        userId: null,
        at: now.toISOString(),
      });
    });

    it('emits HomeOpened with the signed-in user id and the given time', async () => {
      await service.getHome(makeUser({ id: 'user-1' }), now);

      expect(events.emit).toHaveBeenCalledWith(HOME_OPENED_EVENT, {
        userId: 'user-1',
        at: now.toISOString(),
      });
    });
  });
});
