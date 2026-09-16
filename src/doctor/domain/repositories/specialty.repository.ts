import { Specialty } from 'src/doctor/domain/entities/specialty.model';

export interface CreateSpecialtyInput {
  name: string;
}

export interface SpecialtyRepository {
  findById(id: string): Promise<Specialty | null>;
  findAll(): Promise<Specialty[]>;
  create(input: CreateSpecialtyInput): Promise<Specialty>;
}

export const SPECIALTY_REPOSITORY = Symbol('SPECIALTY_REPOSITORY');
