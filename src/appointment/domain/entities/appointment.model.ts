import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';

export class Appointment {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly doctorId: string,
    public readonly clinicId: string | null,
    public scheduledAt: Date,
    public status: AppointmentStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get isUpcoming(): boolean {
    return this.status === AppointmentStatus.SCHEDULED;
  }
}
