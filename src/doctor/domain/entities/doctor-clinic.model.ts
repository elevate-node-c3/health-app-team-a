export class DoctorClinic {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly clinicId: string,
    public fee: number,
    public isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
