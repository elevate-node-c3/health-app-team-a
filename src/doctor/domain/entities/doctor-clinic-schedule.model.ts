export class DoctorClinicSchedule {
  constructor(
    public readonly id: string,
    public readonly doctorClinicId: string,
    public dayOfWeek: number,
    public startTime: string,
    public endTime: string,
    /** How long one patient gets, so the window above becomes discrete slots. */
    public slotMinutes: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
