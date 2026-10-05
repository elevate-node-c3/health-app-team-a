import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { ProcessedEventOrmEntity } from './entities/processed-event.entity';

import type { ProcessedEventRepository } from './processed-event.repository';

/** PostgreSQL unique_violation — another claim already exists for this key. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class TypeOrmProcessedEventRepository implements ProcessedEventRepository {
  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly repo: Repository<ProcessedEventOrmEntity>,
  ) {}

  async tryClaim(eventId: string, handler: string): Promise<boolean> {
    try {
      await this.repo.insert({ eventId, handler });
      return true;
    } catch (error) {
      if (this.isDuplicateClaim(error)) return false;
      throw error;
    }
  }

  async release(eventId: string, handler: string): Promise<void> {
    await this.repo.delete({ eventId, handler });
  }

  private isDuplicateClaim(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === UNIQUE_VIOLATION;
  }
}
