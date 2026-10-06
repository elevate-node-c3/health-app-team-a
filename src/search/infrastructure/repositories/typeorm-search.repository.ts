import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { SearchResult } from 'src/search/domain/entities/search-result.model';
import {
  MapSearchFilter,
  SearchFilter,
  SearchRepository,
} from 'src/search/domain/repositories/search.repository';
import { Repository } from 'typeorm';

import {
  applyAvailabilityFilter,
  applyClinicFilters,
  applyDoctorScalarFilters,
  applySpecialtyFilter,
  escapeLikeTerm,
  joinClinics,
  needsClinicJoin,
  toMapClinicResult,
  type MapRawRow,
} from './search-filters';

import type { MapClinicResult } from 'src/search/domain/entities/map-clinic-result.model';

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

    applyDoctorScalarFilters(qb, filters);

    if (filters.specialty) {
      qb.leftJoin('doctor.specialty', 'specialty');
      applySpecialtyFilter(qb, filters.specialty);
    }

    // The clinic join is conditional here because the list returns doctors and
    // most requests need no clinic column. The availability filter is
    // deliberately outside it: an EXISTS subquery needs no outer alias.
    const joinedClinics = needsClinicJoin(filters);
    if (joinedClinics) {
      joinClinics(qb);
      applyClinicFilters(qb, filters);
    }

    // Doctor-level: the list returns doctors, so availability at any bookable
    // pairing counts.
    applyAvailabilityFilter(qb, filters.availability, 'doctor');

    // Sorting
    const sortBy = filters.sortBy || 'rating';
    const sortOrder = filters.sortOrder || 'DESC';
    const limit = filters.limit || 10;
    const page = filters.page || 1;
    const skip = (page - 1) * limit;

    switch (sortBy) {
      case 'price':
        if (!joinedClinics)
          qb.leftJoin('doctor_clinics', 'dc', 'dc.doctorId = doctor.id');
        // Selected under TypeORM's own `<joinAlias>_<column>` naming so its
        // DISTINCT-wrapper (triggered by take()+joins) finds this column where
        // it expects it — ordering by a joined column it was never told to
        // project otherwise breaks that wrapper's generated SQL.
        qb.addSelect('dc.fee', 'dc_fee').orderBy('dc.fee', sortOrder);
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
    const qb = this.doctorRepo.createQueryBuilder('doctor');
    joinClinics(qb);
    qb.leftJoin('specialties', 'specialty', 'specialty.id = doctor.specialtyId')
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

    applyDoctorScalarFilters(qb, filters);
    applySpecialtyFilter(qb, filters.specialty);
    // `MapSearchFilter` declares no governorate or city - the viewport bounds
    // already constrain location - so those two branches of the shared helper
    // are unreachable here by the type, not merely unused.
    applyClinicFilters(qb, filters);

    // Pairing-level: each row is one doctor-at-clinic, so the row's own pairing
    // must be the one with hours on the requested day.
    applyAvailabilityFilter(qb, filters.availability, 'pairing');

    // Total matches within bounds+filters, uncapped. DISTINCT is kept as a
    // safeguard even though the availability filter no longer joins.
    const countRow = await qb
      .clone()
      .select('COUNT(DISTINCT dc.id)', 'count')
      .getRawOne<{ count: string }>();
    const total = Number(countRow?.count ?? 0);

    const hasLocation =
      filters.userLat !== undefined && filters.userLng !== undefined;
    const distanceExpr =
      'ST_Distance(clinic.location, ST_SetSRID(ST_MakePoint(:userLng, :userLat), 4326)::geography)';

    // DISTINCT is retained defensively; one row per doctor-at-clinic is the
    // contract, and no filter here may multiply that.
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

    return { rows: raw.map(toMapClinicResult), total };
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
