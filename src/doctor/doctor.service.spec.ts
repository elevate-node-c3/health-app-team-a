import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { User } from 'src/auth/domain/entities/user.model';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { Clinic } from 'src/doctor/domain/entities/clinic.model';
import { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';
import { Doctor } from 'src/doctor/domain/entities/doctor.model';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

import { BOOKING_HORIZON_DAYS } from './availability.constants';
import { DOCTOR_PROFILE_VIEWED_EVENT } from './doctor.events';
import { DoctorService } from './doctor.service';

import type {
  BookablePairing,
  DoctorProfileRow,
} from 'src/doctor/domain/repositories/doctor.repository';

/** A Monday. 06:00Z is 09:00 in Cairo, which is on DST in September. */
const now = new Date('2026-09-28T06:00:00.000Z');

const CAIRO = 'Africa/Cairo';
const SATURDAY = 6;

function makeUser(): User {
  return new User(
    'user-1',
    'Nour',
    'nour@example.com',
    '+201000000000',
    Gender.FEMALE,
    true,
    true,
    new Date(),
    new Date(),
    'hash',
  );
}

function makeDoctor(overrides: Partial<{ ratingCount: number }> = {}): Doctor {
  return new Doctor(
    'doc-1',
    'Dr Mona',
    null,
    DoctorTitle.CONSULTANT,
    'spec-1',
    'Interventional',
    'Cairo Uni',
    12,
    900,
    4.7,
    overrides.ratingCount ?? 40,
    Gender.FEMALE,
    true,
    new Date(),
    new Date(),
  );
}

function makeClinic(
  overrides: Partial<{ id: string; name: string; timezone: string }> = {},
): Clinic {
  return new Clinic(
    overrides.id ?? 'clinic-1',
    overrides.name ?? 'Nile Clinic',
    PlaceType.CLINIC,
    'Cairo',
    'Maadi',
    30.05,
    31.23,
    true,
    overrides.timezone ?? CAIRO,
    new Date(),
    new Date(),
  );
}

function makeSchedule(
  overrides: Partial<{
    startTime: string;
    endTime: string;
    slotMinutes: number;
  }> = {},
): DoctorClinicSchedule {
  return new DoctorClinicSchedule(
    'sched-1',
    'pairing-1',
    SATURDAY,
    overrides.startTime ?? '09:00:00',
    overrides.endTime ?? '13:00:00',
    overrides.slotMinutes ?? 30,
    new Date(),
    new Date(),
  );
}

function makeProfileRow(): DoctorProfileRow {
  return {
    doctor: makeDoctor(),
    specialtyName: 'Cardiology',
    clinics: [
      {
        doctorClinicId: 'pairing-1',
        clinic: makeClinic({ id: 'clinic-1', name: 'Nile Clinic' }),
        fee: 300,
      },
      {
        doctorClinicId: 'pairing-2',
        clinic: makeClinic({ id: 'clinic-2', name: 'Maadi Centre' }),
        fee: 450,
      },
    ],
  };
}

function makePairing(
  overrides: Partial<{
    fee: number;
    timezone: string;
    schedules: DoctorClinicSchedule[];
  }> = {},
): BookablePairing {
  return {
    doctorClinicId: 'pairing-1',
    clinic: makeClinic({ timezone: overrides.timezone ?? CAIRO }),
    fee: overrides.fee ?? 300,
    schedules: overrides.schedules ?? [makeSchedule()],
  };
}

describe('DoctorService', () => {
  let doctorRepository: {
    findProfileById: jest.Mock;
    findBookablePairing: jest.Mock;
  };
  let doctorLeaveRepository: { findOverlapping: jest.Mock };
  let appointmentRepository: { findBookedInstants: jest.Mock };
  let favouriteRepository: { exists: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let service: DoctorService;

  beforeEach(() => {
    doctorRepository = {
      findProfileById: jest
        .fn<() => Promise<DoctorProfileRow | null>>()
        .mockResolvedValue(makeProfileRow()),
      findBookablePairing: jest
        .fn<() => Promise<BookablePairing | null>>()
        .mockResolvedValue(makePairing()),
    };
    doctorLeaveRepository = {
      findOverlapping: jest
        .fn<() => Promise<DoctorLeave[]>>()
        .mockResolvedValue([]),
    };
    appointmentRepository = {
      findBookedInstants: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
    };
    favouriteRepository = {
      exists: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    };
    eventEmitter = { emit: jest.fn() };

    service = new DoctorService(
      doctorRepository as never,
      doctorLeaveRepository as never,
      appointmentRepository as never,
      favouriteRepository as never,
      eventEmitter as never,
    );
  });

  describe('getProfile', () => {
    it('returns the doctor with every bookable clinic and its own fee', async () => {
      const response = await service.getProfile('doc-1', null, now);

      expect(response.name).toBe('Dr Mona');
      expect(response.specialty).toBe('Cardiology');
      expect(response.rating).toEqual({ average: 4.7, count: 40 });
      expect(response.clinics).toHaveLength(2);
      // The fee is this pairing's fee, not the cheapest across clinics.
      expect(response.clinics.map((clinic) => clinic.fee)).toEqual([300, 450]);
      expect(
        response.clinics.every((clinic) => clinic.feeCurrency === 'EGP'),
      ).toBe(true);
      expect(response.clinics[0].timezone).toBe(CAIRO);
    });

    it('404s for an unverified doctor and a missing one alike', async () => {
      // The repository applies the isVerified filter, so both arrive as null and
      // a patient cannot tell an unverified profile exists.
      doctorRepository.findProfileById.mockResolvedValue(null);

      await expect(service.getProfile('doc-1', null, now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reports the horizon length so the client can size its calendar', async () => {
      const response = await service.getProfile('doc-1', null, now);

      expect(response.booking).toEqual({ horizonDays: BOOKING_HORIZON_DAYS });
    });

    it('omits isFavourite for a guest and sets it for a signed-in user', async () => {
      const guest = await service.getProfile('doc-1', null, now);
      expect(guest.isFavourite).toBeUndefined();
      expect(favouriteRepository.exists).not.toHaveBeenCalled();

      const signedIn = await service.getProfile('doc-1', makeUser(), now);
      expect(signedIn.isFavourite).toBe(true);
      expect(favouriteRepository.exists).toHaveBeenCalledWith(
        'user-1',
        'doc-1',
      );
    });

    it('drops the rating entirely when the doctor has none', async () => {
      doctorRepository.findProfileById.mockResolvedValue({
        ...makeProfileRow(),
        doctor: makeDoctor({ ratingCount: 0 }),
      });

      const response = await service.getProfile('doc-1', null, now);
      expect(response.rating).toBeNull();
    });
  });

  describe('getAvailability', () => {
    it('exposes no availability when the pairing is not bookable', async () => {
      // An inactive pairing, an inactive clinic or an unverified doctor all come
      // back as null from the repository gate.
      doctorRepository.findBookablePairing.mockResolvedValue(null);

      await expect(
        service.getAvailability('doc-1', { clinicId: 'clinic-1' }, now),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns this pairing’s fee alongside the times', async () => {
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-10' },
        now,
      );

      expect(response.meta.fee).toBe(300);
      expect(response.meta.feeCurrency).toBe('EGP');
    });

    it('defaults to the clinic’s current month rather than the server’s', async () => {
      // 2026-09-30T22:00Z is already October in Cairo.
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1' },
        new Date('2026-09-30T22:00:00.000Z'),
      );

      expect(response.meta.month).toBe('2026-10');
    });

    it('states plainly that the response is a snapshot, not a reservation', async () => {
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1' },
        now,
      );

      expect(response.meta.isReservation).toBe(false);
      expect(response.meta.generatedAt).toBe(now);
      expect(response.meta.staleAfterSeconds).toBeGreaterThan(0);
    });

    it('never offers a date beyond the booking horizon', async () => {
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-10' },
        now,
      );

      // now is 2026-09-28 in Cairo, so the horizon ends 2026-10-28.
      expect(response.meta.booking).toEqual({
        horizonDays: 30,
        earliestDate: '2026-09-28',
        latestDate: '2026-10-28',
        timezone: CAIRO,
      });
      expect(response.data.at(-1)?.date).toBe('2026-10-28');
      expect(response.data.every((day) => day.date <= '2026-10-28')).toBe(true);
    });

    it('never offers a date before today', async () => {
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-09' },
        now,
      );

      // September started weeks ago, but the window opens today.
      expect(response.data[0].date).toBe('2026-09-28');
      expect(response.data.at(-1)?.date).toBe('2026-09-30');
    });

    it('closes the month arrows at the edges of the horizon', async () => {
      const september = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-09' },
        now,
      );
      // August is wholly in the past.
      expect(september.meta.canGoPrevious).toBe(false);
      expect(september.meta.canGoNext).toBe(true);

      const october = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-10' },
        now,
      );
      // September still holds bookable days; November is past the horizon.
      expect(october.meta.canGoPrevious).toBe(true);
      expect(october.meta.canGoNext).toBe(false);
    });

    it('returns an empty month rather than an error beyond the horizon', async () => {
      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-11' },
        now,
      );

      expect(response.data).toEqual([]);
      expect(response.meta.totalSlots).toBe(0);
      // The arrows still let the client navigate back out.
      expect(response.meta.canGoPrevious).toBe(true);
      expect(response.meta.canGoNext).toBe(false);
      expect(appointmentRepository.findBookedInstants).not.toHaveBeenCalled();
    });

    it('computes the window on the clinic clock, not the server clock', async () => {
      // 21:30Z on 2026-09-28 is still the 28th in London but the 29th in Cairo.
      const late = new Date('2026-09-28T21:30:00.000Z');

      doctorRepository.findBookablePairing.mockResolvedValue(
        makePairing({ timezone: CAIRO }),
      );
      const cairo = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1' },
        late,
      );
      expect(cairo.meta.booking.earliestDate).toBe('2026-09-29');

      doctorRepository.findBookablePairing.mockResolvedValue(
        makePairing({ timezone: 'Europe/London' }),
      );
      const london = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1' },
        late,
      );
      expect(london.meta.booking.earliestDate).toBe('2026-09-28');
      expect(london.meta.timezone).toBe('Europe/London');
    });

    it('counts available and taken slots separately', async () => {
      appointmentRepository.findBookedInstants.mockResolvedValue([
        // 10:00 Cairo on Saturday 2026-10-03.
        {
          scheduledAt: new Date('2026-10-03T07:00:00.000Z'),
          durationMinutes: 30,
        },
      ]);

      const response = await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-10' },
        now,
      );

      expect(response.meta.takenSlots).toBe(1);
      expect(response.meta.availableSlots).toBe(response.meta.totalSlots - 1);
      const saturday = response.data.find((day) => day.date === '2026-10-03');
      expect(saturday?.slots.filter((slot) => slot.isTaken)).toHaveLength(1);
    });

    it('asks for leave and bookings over the clamped window only', async () => {
      await service.getAvailability(
        'doc-1',
        { clinicId: 'clinic-1', month: '2026-10' },
        now,
      );

      expect(doctorLeaveRepository.findOverlapping).toHaveBeenCalledWith(
        'doc-1',
        '2026-10-01',
        '2026-10-28',
      );
      const [doctorId, clinicId, from, to] =
        appointmentRepository.findBookedInstants.mock.calls[0];
      expect(doctorId).toBe('doc-1');
      expect(clinicId).toBe('clinic-1');
      // Half-open: 2026-10-01 00:00 Cairo through the start of 2026-10-29, so
      // the last day of the window is fully covered. Both are +03:00 because
      // Egypt's DST does not end until 2026-10-30.
      expect(from).toEqual(new Date('2026-09-30T21:00:00.000Z'));
      expect(to).toEqual(new Date('2026-10-28T21:00:00.000Z'));
    });
  });

  describe('analytics', () => {
    it('publishes a profile-viewed event, with null for a guest', async () => {
      await service.getProfile('doc-1', null, now);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCTOR_PROFILE_VIEWED_EVENT,
        { doctorId: 'doc-1', userId: null, at: now },
      );
    });

    it('records the signed-in user who viewed the profile', async () => {
      await service.getProfile('doc-1', makeUser(), now);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCTOR_PROFILE_VIEWED_EVENT,
        { doctorId: 'doc-1', userId: 'user-1', at: now },
      );
    });

    it('does not fire on availability, so month paging cannot inflate views', async () => {
      await service.getAvailability('doc-1', { clinicId: 'clinic-1' }, now);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
