import { AppointmentStatus } from '../domain/enums/appointment-status.enum';

export interface AppointmentDto {
  userId: string;
  doctorId: string;
  clinicId: string | null;
  bookingId: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
}
