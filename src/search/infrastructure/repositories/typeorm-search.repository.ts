import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { SearchResult } from 'src/search/domain/entities/search-result.model';
import {
  SearchFilter,
  SearchRepository,
} from 'src/search/domain/repositories/search.repository';
import { Repository } from 'typeorm';

const escapeLikeTerm = (term: string): string =>
  term.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class TypeOrmSearchRepository implements SearchRepository {
  constructor(
    @InjectRepository(SpecialtyOrmEntity)
    private readonly specialtyRepo: Repository<SpecialtyOrmEntity>,
    @InjectRepository(DoctorOrmEntity)
    private readonly doctorRepo: Repository<DoctorOrmEntity>,
  ) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const escapedQuery = escapeLikeTerm(query.toLowerCase());
    const parameters = {
      query: query.toLowerCase(),
      pattern: `%${escapedQuery}%`,
      prefix: `${escapedQuery}%`,
      wordBoundary: `% ${escapedQuery}%`,
    };

    const [specialties, doctors] = await Promise.all([
      this.searchSpecialties(parameters, limit),
      this.searchDoctors(parameters, limit),
    ]);

    return [...specialties, ...doctors].slice(0, limit);
  }

  async searchWithFilters(filters: SearchFilter): Promise<SearchResult[]> {
    const qb = this.doctorRepo.createQueryBuilder('doctor');
    qb.where('doctor.isVerified = true');

    if (filters.query) {
      const escapedQuery = escapeLikeTerm(filters.query.toLowerCase());
      qb.andWhere("LOWER(doctor.name) LIKE :pattern ESCAPE '\\'", {
        pattern: `%${escapedQuery}%`,
      });
    }

    if (filters.genders && filters.genders.length > 0) {
      qb.andWhere('doctor.gender IN (:...genders)', {
        genders: filters.genders,
      });
    }

    if (filters.titles && filters.titles.length > 0) {
      qb.andWhere('doctor.title IN (:...titles)', { titles: filters.titles });
    }

    if (filters.rating) {
      qb.andWhere('doctor.ratingAverage >= :rating', {
        rating: filters.rating,
      });
    }

    if (filters.specialty) {
      qb.leftJoin('doctor.specialty', 'specialty');
      qb.andWhere(
        '(specialty.id = :specialty OR specialty.name = :specialty)',
        { specialty: filters.specialty },
      );
    }

    // Join doctor_clinics and clinics if needed
    const needsClinicJoin =
      filters.places?.length ||
      filters.governorate ||
      filters.city ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined;

    if (needsClinicJoin) {
      qb.innerJoin(
        'doctor_clinics',
        'dc',
        'dc.doctorId = doctor.id AND dc.isActive = true',
      );
      qb.innerJoin(
        'clinics',
        'clinic',
        'clinic.id = dc.clinicId AND clinic.isActive = true',
      );

      if (filters.places && filters.places.length > 0) {
        qb.andWhere('clinic.placeType IN (:...places)', {
          places: filters.places,
        });
      }

      if (filters.governorate) {
        qb.andWhere('clinic.governorate = :governorate', {
          governorate: filters.governorate,
        });
      }

      if (filters.city) {
        qb.andWhere('clinic.city = :city', { city: filters.city });
      }

      if (filters.minPrice !== undefined) {
        qb.andWhere('dc.fee >= :minPrice', { minPrice: filters.minPrice });
      }

      if (filters.maxPrice !== undefined) {
        if (filters.maxPrice < 1000) {
          qb.andWhere('dc.fee <= :maxPrice', { maxPrice: filters.maxPrice });
        }
        // If maxPrice is 1000, it means 1000 and above, so we don't apply an upper bound.
      }
    }

    if (filters.availability && filters.availability.length > 0) {
      if (!filters.availability.includes('Any Day')) {
        const today = new Date(
          new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
        );
        const currentDayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
        const tomorrowDayOfWeek = (currentDayOfWeek + 1) % 7;

        const daysToCheck: number[] = [];
        if (filters.availability.includes('Today'))
          daysToCheck.push(currentDayOfWeek);
        if (filters.availability.includes('Tomorrow'))
          daysToCheck.push(tomorrowDayOfWeek);

        if (daysToCheck.length > 0) {
          // Check if there is any schedule for the required days
          qb.innerJoin(
            'doctor_clinic_schedules',
            'dcs',
            'dcs.doctorClinicId = dc.id',
          );
          qb.andWhere('dcs.dayOfWeek IN (:...days)', { days: daysToCheck });

          // Basic capacity check: Assume 30 min slot, if booked appointments on that day >= capacity, then not available
          // Since we don't have the exact date in 'dcs', this requires a complex subquery.
          // For simplicity in this implementation step, we just ensure they have a schedule for that day.
          // In a fully robust system, we would join with appointments and group by date.
        }
      }
    }

    // Sorting
    const sortBy = filters.sortBy || 'rating';
    const sortOrder = filters.sortOrder || 'DESC';
    const limit = filters.limit || 10;
    const page = filters.page || 1;
    const skip = (page - 1) * limit;

    switch (sortBy) {
      case 'price':
        if (!needsClinicJoin)
          qb.leftJoin('doctor_clinics', 'dc', 'dc.doctorId = doctor.id');
        qb.orderBy('dc.fee', sortOrder);
        break;
      case 'experience':
        qb.orderBy('doctor.yearsOfExperience', sortOrder);
        break;
      case 'rating':
      default:
        qb.orderBy('doctor.ratingAverage', sortOrder);
        break;
    }

    qb.addOrderBy('doctor.id', 'ASC');

    qb.take(limit).skip(skip);

    const rows = await qb.getMany();
    return rows.map((row) => new SearchResult(row.id, row.name, 'doctor'));
  }

  private async searchSpecialties(
    parameters: Record<string, string>,
    limit: number,
  ): Promise<SearchResult[]> {
    const rows = await this.specialtyRepo
      .createQueryBuilder('specialty')
      .where("LOWER(specialty.name) LIKE :pattern ESCAPE '\\'", parameters)
      .addOrderBy(this.relevanceOrder('specialty.name'), 'ASC')
      .addOrderBy('LENGTH(specialty.name)', 'ASC')
      .addOrderBy('specialty.name', 'ASC')
      .addOrderBy('specialty.id', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((row) => new SearchResult(row.id, row.name, 'specialty'));
  }

  private async searchDoctors(
    parameters: Record<string, string>,
    limit: number,
  ): Promise<SearchResult[]> {
    const rows = await this.doctorRepo
      .createQueryBuilder('doctor')
      .where('doctor.isVerified = true')
      .andWhere("LOWER(doctor.name) LIKE :pattern ESCAPE '\\'", parameters)
      .addOrderBy(this.relevanceOrder('doctor.name'), 'ASC')
      .addOrderBy('LENGTH(doctor.name)', 'ASC')
      .addOrderBy('doctor.name', 'ASC')
      .addOrderBy('doctor.id', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((row) => new SearchResult(row.id, row.name, 'doctor'));
  }

  private relevanceOrder(column: string): string {
    return `CASE
      WHEN LOWER(${column}) = :query THEN 0
      WHEN LOWER(${column}) LIKE :prefix ESCAPE '\\' THEN 1
      WHEN LOWER(${column}) LIKE :wordBoundary ESCAPE '\\' THEN 2
      ELSE 3
    END`;
  }
}
