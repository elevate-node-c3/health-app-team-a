import { Gender } from 'src/auth/domain/enums/user.enum';
import { Clinic } from 'src/doctor/domain/entities/clinic.model';
import { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import { DoctorClinic } from 'src/doctor/domain/entities/doctor-clinic.model';
import { Doctor } from 'src/doctor/domain/entities/doctor.model';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';

export interface CreateDoctorInput {
  name: string;
  photo: string | null;
  title: DoctorTitle;
  specialtyId: string;
  subspecialties: string | null;
  university: string;
  yearsOfExperience: number;
  patientsCount: number;
  ratingAverage: number;
  ratingCount: number;
  gender: Gender;
  isVerified: boolean;
}

export interface CreateDoctorClinicInput {
  doctorId: string;
  clinicId: string;
  fee: number;
  isActive: boolean;
}

export interface CreateDoctorClinicScheduleInput {
  doctorClinicId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

/** A doctor as any card/list consumer should see it */
export interface VisibleDoctor {
  doctor: Doctor;
  cardPrice: number | null;
}

/**
 * A clinic this doctor can actually be booked at, carrying the fee for THIS
 * pairing — not the cheapest fee across the doctor's clinics that the card
 * price reports.
 */
export interface BookableClinic {
  doctorClinicId: string;
  clinic: Clinic;
  fee: number;
}

/** Everything the profile screen needs about one doctor. */
export interface DoctorProfileRow {
  doctor: Doctor;
  specialtyName: string;
  clinics: BookableClinic[];
}

/** One bookable doctor-at-clinic pairing plus the hours it keeps. */
export interface BookablePairing {
  doctorClinicId: string;
  clinic: Clinic;
  fee: number;
  schedules: DoctorClinicSchedule[];
}

export interface DoctorRepository {
  create(input: CreateDoctorInput): Promise<Doctor>;
  addClinicPairing(input: CreateDoctorClinicInput): Promise<DoctorClinic>;
  addSchedule(
    input: CreateDoctorClinicScheduleInput,
  ): Promise<DoctorClinicSchedule>;

  /** Verified doctors only — the "only real doctors appear" rule. */
  findVisibleById(id: string): Promise<VisibleDoctor | null>;
  findAllVisible(): Promise<VisibleDoctor[]>;

  /** Top Doctors for Home. */
  findTopRanked(limit: number): Promise<VisibleDoctor[]>;

  /**
   * The doctor profile screen: a verified doctor with every clinic pairing a
   * patient could book. Inactive pairings and inactive clinics are excluded, so
   * they expose no availability at all.
   */
  findProfileById(doctorId: string): Promise<DoctorProfileRow | null>;

  /**
   * One bookable pairing with its recurring hours, or null when the doctor is
   * unverified, the pairing is inactive, or the clinic is inactive. This is the
   * gate that keeps unbookable pairings from ever reaching slot generation.
   */
  findBookablePairing(
    doctorId: string,
    clinicId: string,
  ): Promise<BookablePairing | null>;
}

export const DOCTOR_REPOSITORY = Symbol('DOCTOR_REPOSITORY');
