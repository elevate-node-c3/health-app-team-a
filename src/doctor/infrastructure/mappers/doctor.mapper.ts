import { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import { DoctorClinic } from 'src/doctor/domain/entities/doctor-clinic.model';
import { Doctor } from 'src/doctor/domain/entities/doctor.model';
import { DoctorClinicScheduleOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';

export class DoctorMapper {
  static toDomain(ormEntity: DoctorOrmEntity): Doctor {
    return new Doctor(
      ormEntity.id,
      ormEntity.name,
      ormEntity.photo,
      ormEntity.title,
      ormEntity.specialtyId,
      ormEntity.subspecialties,
      ormEntity.university,
      ormEntity.yearsOfExperience,
      ormEntity.patientsCount,
      Number(ormEntity.ratingAverage),
      ormEntity.ratingCount,
      ormEntity.gender,
      ormEntity.isVerified,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}

export class DoctorClinicMapper {
  static toDomain(ormEntity: DoctorClinicOrmEntity): DoctorClinic {
    return new DoctorClinic(
      ormEntity.id,
      ormEntity.doctorId,
      ormEntity.clinicId,
      Number(ormEntity.fee),
      ormEntity.isActive,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}

export class DoctorClinicScheduleMapper {
  static toDomain(
    ormEntity: DoctorClinicScheduleOrmEntity,
  ): DoctorClinicSchedule {
    return new DoctorClinicSchedule(
      ormEntity.id,
      ormEntity.doctorClinicId,
      ormEntity.dayOfWeek,
      ormEntity.startTime,
      ormEntity.endTime,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
