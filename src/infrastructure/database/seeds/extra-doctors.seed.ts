import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';

import dataSource from '../data-source';

export async function seedExtraDoctors(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      // 1. Ophthalmology
      const OPHTHALMOLOGY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
      await manager.upsert(
        SpecialtyOrmEntity,
        { id: OPHTHALMOLOGY_ID, name: 'Ophthalmology (seed)' },
        ['id'],
      );

      const OPHTHALMOLOGIST_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
      await manager.upsert(
        DoctorOrmEntity,
        {
          id: OPHTHALMOLOGIST_ID,
          name: 'Dr Eye Expert',
          photo: null,
          title: DoctorTitle.PROFESSOR,
          specialtyId: OPHTHALMOLOGY_ID,
          subspecialties: 'Retina, Glaucoma',
          university: 'Ain Shams University',
          yearsOfExperience: 25,
          patientsCount: 1500,
          ratingAverage: 4.9,
          ratingCount: 120,
          gender: Gender.MALE,
          isVerified: true,
        },
        ['id'],
      );

      // 2. Neurology
      const NEUROLOGY_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
      await manager.upsert(
        SpecialtyOrmEntity,
        { id: NEUROLOGY_ID, name: 'Neurology (seed)' },
        ['id'],
      );

      const NEUROLOGIST_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
      await manager.upsert(
        DoctorOrmEntity,
        {
          id: NEUROLOGIST_ID,
          name: 'Dr Brain Specialist',
          photo: null,
          title: DoctorTitle.CONSULTANT,
          specialtyId: NEUROLOGY_ID,
          subspecialties: 'Headaches, Migraines',
          university: 'Alexandria University',
          yearsOfExperience: 18,
          patientsCount: 800,
          ratingAverage: 4.8,
          ratingCount: 95,
          gender: Gender.FEMALE,
          isVerified: true,
        },
        ['id'],
      );

      // 3. Clinics
      const CLINIC_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
      const CLINIC_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';

      await manager.upsert(
        ClinicOrmEntity,
        [
          {
            id: CLINIC_1,
            name: 'Clear Vision Clinic',
            placeType: PlaceType.CLINIC,
            governorate: 'Giza',
            city: 'Dokki',
            latitude: 30.03,
            longitude: 31.21,
            isActive: true,
            timezone: 'Africa/Cairo',
          },
          {
            id: CLINIC_2,
            name: 'NeuroHealth Center',
            placeType: PlaceType.CENTRE,
            governorate: 'Cairo',
            city: 'Heliopolis',
            latitude: 30.09,
            longitude: 31.32,
            isActive: true,
            timezone: 'Africa/Cairo',
          },
        ],
        ['id'],
      );

      // 4. Pairings
      await manager.upsert(
        DoctorClinicOrmEntity,
        [
          {
            id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
            doctorId: OPHTHALMOLOGIST_ID,
            clinicId: CLINIC_1,
            fee: 500,
            isActive: true,
          },
          {
            id: 'ffffffff-ffff-4fff-8fff-fffffffffff2',
            doctorId: NEUROLOGIST_ID,
            clinicId: CLINIC_2,
            fee: 600,
            isActive: true,
          },
        ],
        ['id'],
      );
    });
    console.log('Extra doctors seeded successfully!');
  } catch (err) {
    console.error('Failed to seed extra doctors:', err);
  } finally {
    await dataSource.destroy();
  }
}

seedExtraDoctors().catch(console.error);
