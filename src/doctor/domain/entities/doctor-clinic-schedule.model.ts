export class DoctorClinicSchedule {
  constructor(
    public readonly id: string,
    public readonly doctorClinicId: string,
    public dayOfWeek: number,
    public startTime: string,
    public endTime: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
