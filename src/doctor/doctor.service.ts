import { DoctorRepository } from './domain/repositories/doctor.repository';

export class DoctorService {
  constructor(private readonly DoctorRepo: DoctorRepository) {}
}
