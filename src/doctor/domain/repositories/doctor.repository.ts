import { Gender } from 'src/auth/domain/enums/user.enum';
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
}

/**
 * A doctor as any card/list consumer should see it: the domain entity plus the
 * one price every screen agrees on (cheapest fee among active pairings at
 * active clinics). `cardPrice` is null only if a verified doctor somehow has
 * no active pairing left.
 */
export interface VisibleDoctor {
  doctor: Doctor;
  cardPrice: number | null;
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
}

export const DOCTOR_REPOSITORY = Symbol('DOCTOR_REPOSITORY');
