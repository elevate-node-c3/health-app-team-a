import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  SearchHistoryEntry,
  SearchHistoryRepository,
} from 'src/search/domain/repositories/search-history.repository';
import { SearchHistoryOrmEntity } from 'src/search/infrastructure/entities/typeorm/search-history.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmSearchHistoryRepository implements SearchHistoryRepository {
  constructor(
    @InjectRepository(SearchHistoryOrmEntity)
    private readonly historyRepo: Repository<SearchHistoryOrmEntity>,
  ) {}

  async findRecent(
    ownerKey: string,
    limit: number,
  ): Promise<SearchHistoryEntry[]> {
    const rows = await this.historyRepo.find({
      where: { ownerKey },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return rows.map((row) => ({ term: row.term, createdAt: row.createdAt }));
  }

  async remember(
    ownerKey: string,
    term: string,
    normalizedTerm: string,
    limit: number,
  ): Promise<void> {
    await this.historyRepo.upsert(
      { ownerKey, term, normalizedTerm, createdAt: new Date() },
      ['ownerKey', 'normalizedTerm'],
    );
    await this.trim(ownerKey, limit);
  }

  async clear(ownerKey: string): Promise<void> {
    await this.historyRepo.delete({ ownerKey });
  }

  async merge(
    deviceOwnerKey: string,
    userOwnerKey: string,
    limit: number,
  ): Promise<void> {
    const deviceRows = await this.historyRepo.find({
      where: { ownerKey: deviceOwnerKey },
      order: { createdAt: 'DESC' },
    });

    for (const row of deviceRows) {
      await this.historyRepo.upsert(
        {
          ownerKey: userOwnerKey,
          term: row.term,
          normalizedTerm: row.normalizedTerm,
          createdAt: row.createdAt,
        },
        ['ownerKey', 'normalizedTerm'],
      );
    }

    await this.historyRepo.delete({ ownerKey: deviceOwnerKey });
    await this.trim(userOwnerKey, limit);
  }

  private async trim(ownerKey: string, limit: number): Promise<void> {
    const rows = await this.historyRepo.find({
      where: { ownerKey },
      order: { createdAt: 'DESC' },
      skip: limit,
      select: { id: true },
    });

    if (rows.length > 0)
      await this.historyRepo.delete(rows.map((row) => row.id));
  }
}
