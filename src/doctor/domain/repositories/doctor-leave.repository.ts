import { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';

export interface CreateDoctorLeaveInput {
  doctorId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface DoctorLeaveRepository {
  /**
   * Every leave period for this doctor that touches the inclusive date window.
   * Leave is personal, so it applies at all of the doctor's clinics.
   */
  findOverlapping(
    doctorId: string,
    fromDate: string,
    toDate: string,
  ): Promise<DoctorLeave[]>;

  create(input: CreateDoctorLeaveInput): Promise<DoctorLeave>;
}

export const DOCTOR_LEAVE_REPOSITORY = Symbol('DOCTOR_LEAVE_REPOSITORY');
