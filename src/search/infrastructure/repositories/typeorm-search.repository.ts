import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { MapClinicResult } from 'src/search/domain/entities/map-clinic-result.model';
import { SearchResult } from 'src/search/domain/entities/search-result.model';
import {
  MapSearchFilter,
  SearchFilter,
  SearchRepository,
} from 'src/search/domain/repositories/search.repository';
import { SelectQueryBuilder, Repository } from 'typeorm';

const escapeLikeTerm = (term: string): string =>
  term.replace(/[\\%_]/g, '\\$&');

/** Shared doctor-level (no-join) filters applied on the `doctor` alias. */
interface DoctorScalarFilters {
  query?: string;
  genders?: string[];
  titles?: string[];
  rating?: number;
}

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

    this.applyDoctorScalarFilters(qb, filters);

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

    this.applyAvailabilityFilter(qb, filters.availability);

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

  async searchMap(
    filters: MapSearchFilter,
  ): Promise<{ rows: MapClinicResult[]; total: number }> {
    // Map View always resolves clinic coordinates + per-clinic fee, so the
    // doctor_clinics -> clinics join is unconditional. Each surviving row is one
    // doctor-at-clinic ("card per doctor-clinic"); rows sharing clinicId share a
    // map pin. `clinic.location IS NOT NULL` defensively excludes clinics
    // without coordinates instead of failing the whole query.
    const qb = this.doctorRepo
      .createQueryBuilder('doctor')
      .innerJoin(
        'doctor_clinics',
        'dc',
        'dc.doctorId = doctor.id AND dc.isActive = true',
      )
      .innerJoin(
        'clinics',
        'clinic',
        'clinic.id = dc.clinicId AND clinic.isActive = true',
      )
      .leftJoin('specialties', 'specialty', 'specialty.id = doctor.specialtyId')
      .where('doctor.isVerified = true')
      .andWhere('clinic.location IS NOT NULL')
      // Bounds query — uses the GiST index on clinic.location (no full scan).
      .andWhere(
        'ST_Intersects(clinic.location, ST_MakeEnvelope(:swLng, :swLat, :neLng, :neLat, 4326)::geography)',
        {
          swLng: filters.swLng,
          swLat: filters.swLat,
          neLng: filters.neLng,
          neLat: filters.neLat,
        },
      );

    this.applyDoctorScalarFilters(qb, filters);

    if (filters.specialty) {
      qb.andWhere(
        '(specialty.id = :specialty OR specialty.name = :specialty)',
        { specialty: filters.specialty },
      );
    }

    if (filters.places && filters.places.length > 0) {
      qb.andWhere('clinic.placeType IN (:...places)', {
        places: filters.places,
      });
    }

    if (filters.minPrice !== undefined) {
      qb.andWhere('dc.fee >= :minPrice', { minPrice: filters.minPrice });
    }

    if (filters.maxPrice !== undefined && filters.maxPrice < 1000) {
      qb.andWhere('dc.fee <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    this.applyAvailabilityFilter(qb, filters.availability);

    // Total matches within bounds+filters, uncapped. COUNT(DISTINCT dc.id)
    // ignores any row multiplication from the availability schedule join.
    const countRow = await qb
      .clone()
      .select('COUNT(DISTINCT dc.id)', 'count')
      .getRawOne<{ count: string }>();
    const total = Number(countRow?.count ?? 0);

    const hasLocation =
      filters.userLat !== undefined && filters.userLng !== undefined;
    const distanceExpr =
      'ST_Distance(clinic.location, ST_SetSRID(ST_MakePoint(:userLng, :userLat), 4326)::geography)';

    // DISTINCT collapses any schedule-join duplicates (no dcs column is
    // selected, so duplicate rows are fully identical).
    qb.distinct(true)
      .select('dc.id', 'doctorClinicId')
      .addSelect('clinic.id', 'clinicId')
      .addSelect('clinic.name', 'clinicName')
      .addSelect('clinic.placeType', 'placeType')
      .addSelect('clinic.governorate', 'governorate')
      .addSelect('clinic.city', 'city')
      .addSelect('clinic.latitude', 'latitude')
      .addSelect('clinic.longitude', 'longitude')
      .addSelect('doctor.id', 'doctorId')
      .addSelect('doctor.name', 'doctorName')
      .addSelect('doctor.photo', 'doctorPhoto')
      .addSelect('doctor.title', 'title')
      .addSelect('specialty.name', 'specialtyName')
      .addSelect('doctor.ratingAverage', 'ratingAverage')
      .addSelect('doctor.ratingCount', 'ratingCount')
      .addSelect('dc.fee', 'fee');

    if (hasLocation) {
      qb.addSelect(distanceExpr, 'distanceMeters')
        .setParameter('userLng', filters.userLng)
        .setParameter('userLat', filters.userLat);
      // Rank by real distance when the user location is known.
      qb.orderBy('"distanceMeters"', 'ASC');
    } else {
      // No fabricated distance when the location is unknown.
      qb.addSelect('NULL::double precision', 'distanceMeters');
      // Fall back to rating so the closest-to-best clinics surface first.
      qb.orderBy('"ratingAverage"', 'DESC');
    }
    qb.addOrderBy('"clinicId"', 'ASC').addOrderBy('"doctorId"', 'ASC');
    qb.limit(filters.limit);

    const raw = await qb.getRawMany<MapRawRow>();
    const rows = raw.map(
      (r) =>
        new MapClinicResult(
          r.doctorClinicId,
          r.clinicId,
          r.clinicName,
          r.placeType as MapClinicResult['placeType'],
          r.governorate,
          r.city,
          Number(r.latitude),
          Number(r.longitude),
          r.doctorId,
          r.doctorName,
          r.doctorPhoto,
          r.title as MapClinicResult['title'],
          r.specialtyName ?? '',
          Number(r.ratingAverage),
          Number(r.ratingCount),
          Number(r.fee),
          r.distanceMeters === null ? null : Number(r.distanceMeters),
        ),
    );

    return { rows, total };
  }

  /** Doctor-table filters that need no join — shared by list and map search. */
  private applyDoctorScalarFilters(
    qb: SelectQueryBuilder<DoctorOrmEntity>,
    filters: DoctorScalarFilters,
  ): void {
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
  }

  /**
   * Availability filter (Today/Tomorrow) — shared by list and map search.
   * Requires the `dc` (doctor_clinics) alias to already be joined; only applied
   * when a concrete day is requested (never for "Any Day").
   */
  private applyAvailabilityFilter(
    qb: SelectQueryBuilder<DoctorOrmEntity>,
    availability?: string[],
  ): void {
    if (!availability || availability.length === 0) return;
    if (availability.includes('Any Day')) return;

    const today = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
    );
    const currentDayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const tomorrowDayOfWeek = (currentDayOfWeek + 1) % 7;

    const daysToCheck: number[] = [];
    if (availability.includes('Today')) daysToCheck.push(currentDayOfWeek);
    if (availability.includes('Tomorrow')) daysToCheck.push(tomorrowDayOfWeek);

    if (daysToCheck.length > 0) {
      qb.innerJoin(
        'doctor_clinic_schedules',
        'dcs',
        'dcs.doctorClinicId = dc.id',
      );
      qb.andWhere('dcs.dayOfWeek IN (:...days)', { days: daysToCheck });
    }
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

/** Raw row shape returned by the map `getRawMany` (all numerics as strings). */
interface MapRawRow {
  doctorClinicId: string;
  clinicId: string;
  clinicName: string;
  placeType: string;
  governorate: string;
  city: string;
  latitude: string;
  longitude: string;
  doctorId: string;
  doctorName: string;
  doctorPhoto: string | null;
  title: string;
  specialtyName: string | null;
  ratingAverage: string;
  ratingCount: string;
  fee: string;
  distanceMeters: string | null;
}
