import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';

export class Doctor {
  constructor(
    public readonly id: string,
    public name: string,
    public photo: string | null,
    public title: DoctorTitle,
    public specialtyId: string,
    public subspecialties: string | null,
    public university: string,
    public yearsOfExperience: number,
    public patientsCount: number,
    public ratingAverage: number,
    public ratingCount: number,
    public gender: Gender,
    public isVerified: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get hasRatings(): boolean {
    return this.ratingCount > 0;
  }
}
