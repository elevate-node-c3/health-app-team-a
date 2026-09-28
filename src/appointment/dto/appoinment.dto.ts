import { AppointmentStatus } from '../domain/enums/appointment-status.enum';

export interface AppointmentDto {
  bookingId: string;
  scheduledAt: Date;
  status?: AppointmentStatus;
}
