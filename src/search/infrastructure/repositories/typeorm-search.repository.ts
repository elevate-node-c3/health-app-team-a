import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { DoctorSearchResult } from 'src/search/domain/entities/doctor-search-result.model';
import { SearchResult } from 'src/search/domain/entities/search-result.model';
import {
  SearchFilter,
  SearchRepository,
} from 'src/search/domain/repositories/search.repository';
import { Repository, SelectQueryBuilder } from 'typeorm';

const escapeLikeTerm = (term: string): string =>
  term.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class TypeOrmSearchRepository implements SearchRepository {
  constructor(
    @InjectRepository(SpecialtyOrmEntity)
    private readonly specialtyRepo: Repository<SpecialtyOrmEntity>,
    @InjectRepository(DoctorOrmEntity)
    private readonly doctorRepo: Repository<DoctorOrmEntity>,
    @InjectRepository(DoctorClinicOrmEntity)
    private readonly doctorClinicRepo: Repository<DoctorClinicOrmEntity>,
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
      this.searchDoctorSuggestions(parameters, limit),
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

  async searchDoctors(input: {
    query: string;
    specialtyId?: string;
    sort: 'recommended' | 'price_asc' | 'price_desc';
    limit: number;
    cursor?: {
      id: string;
      fee?: number;
      rating?: number;
      patientsCount?: number;
    };
  }): Promise<{ results: DoctorSearchResult[]; hasMore: boolean }> {
    const feeQuery = this.doctorClinicRepo
      .createQueryBuilder('pricePairing')
      .innerJoin('pricePairing.clinic', 'priceClinic')
      .select('pricePairing.doctorId', 'doctorId')
      .addSelect('MIN(pricePairing.fee)', 'consultationFee')
      .where('pricePairing.isActive = true')
      .andWhere('priceClinic.isActive = true')
      .groupBy('pricePairing.doctorId');

    const queryBuilder = this.doctorRepo
      .createQueryBuilder('doctor')
      .innerJoin('doctor.specialty', 'specialty')
      .innerJoin(
        `(${feeQuery.getQuery()})`,
        'cardPrice',
        'cardPrice."doctorId" = doctor.id',
      )
      .where('doctor.isVerified = true')
      .setParameters(feeQuery.getParameters())
      .select('doctor.id', 'id')
      .addSelect('doctor.name', 'name')
      .addSelect('specialty.name', 'specialty')
      .addSelect('doctor.ratingAverage', 'rating')
      .addSelect('doctor.patientsCount', 'patientsCount')
      .addSelect('cardPrice."consultationFee"', 'consultationFee');

    if (input.query) {
      const escapedQuery = escapeLikeTerm(input.query.toLowerCase());
      queryBuilder.andWhere(
        "(LOWER(doctor.name) LIKE :pattern ESCAPE '\\' OR LOWER(specialty.name) LIKE :pattern ESCAPE '\\')",
        { pattern: `%${escapedQuery}%` },
      );
    }
    if (input.specialtyId) {
      queryBuilder.andWhere('doctor.specialtyId = :specialtyId', {
        specialtyId: input.specialtyId,
      });
    }

    this.applyCursor(queryBuilder, input);
    this.applyOrdering(queryBuilder, input.sort);

    const rows = await queryBuilder.take(input.limit + 1).getRawMany<{
      id: string;
      name: string;
      specialty: string;
      rating: string;
      patientsCount: string;
      consultationFee: string;
    }>();

    return {
      hasMore: rows.length > input.limit,
      results: rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        name: row.name,
        specialty: row.specialty,
        rating: Number(row.rating),
        consultationFee: Number(row.consultationFee),
        recommendationScore:
          Number(row.rating) * 1_000_000 + Number(row.patientsCount),
      })),
    };
  }

  private applyCursor(
    queryBuilder: SelectQueryBuilder<DoctorOrmEntity>,
    input: {
      sort: 'recommended' | 'price_asc' | 'price_desc';
      cursor?: {
        id: string;
        fee?: number;
        rating?: number;
        patientsCount?: number;
      };
    },
  ): void {
    const cursor = input.cursor;
    if (!cursor) return;

    if (input.sort === 'price_asc' || input.sort === 'price_desc') {
      const operator = input.sort === 'price_asc' ? '>' : '<';
      queryBuilder.andWhere(
        `(cardPrice."consultationFee" ${operator} :cursorFee OR (cardPrice."consultationFee" = :cursorFee AND doctor.id > :cursorId))`,
        { cursorFee: cursor.fee, cursorId: cursor.id },
      );
      return;
    }

    queryBuilder.andWhere(
      `(doctor.ratingAverage < :cursorRating OR (doctor.ratingAverage = :cursorRating AND doctor.patientsCount < :cursorPatients) OR (doctor.ratingAverage = :cursorRating AND doctor.patientsCount = :cursorPatients AND cardPrice."consultationFee" > :cursorFee) OR (doctor.ratingAverage = :cursorRating AND doctor.patientsCount = :cursorPatients AND cardPrice."consultationFee" = :cursorFee AND doctor.id > :cursorId))`,
      {
        cursorRating: cursor.rating,
        cursorPatients: cursor.patientsCount,
        cursorFee: cursor.fee,
        cursorId: cursor.id,
      },
    );
  }

  private applyOrdering(
    queryBuilder: SelectQueryBuilder<DoctorOrmEntity>,
    sort: 'recommended' | 'price_asc' | 'price_desc',
  ): void {
    if (sort === 'price_asc') {
      queryBuilder
        .orderBy('cardPrice."consultationFee"', 'ASC')
        .addOrderBy('doctor.id', 'ASC');
      return;
    }
    if (sort === 'price_desc') {
      queryBuilder
        .orderBy('cardPrice."consultationFee"', 'DESC')
        .addOrderBy('doctor.id', 'ASC');
      return;
    }
    queryBuilder
      .orderBy('doctor.ratingAverage', 'DESC')
      .addOrderBy('doctor.patientsCount', 'DESC')
      .addOrderBy('cardPrice."consultationFee"', 'ASC')
      .addOrderBy('doctor.id', 'ASC');
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

  private async searchDoctorSuggestions(
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
