import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { SearchResult } from 'src/search/domain/entities/search-result.model';
import { SearchRepository } from 'src/search/domain/repositories/search.repository';
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
