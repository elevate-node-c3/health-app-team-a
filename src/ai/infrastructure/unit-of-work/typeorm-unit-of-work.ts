import { Injectable } from '@nestjs/common';
import { advisoryXactLock } from 'src/infrastructure/database/advisory-lock';
import { appendOutboxEvent } from 'src/infrastructure/database/outbox';
import { DataSource } from 'typeorm';

import {
  AiConversationOrmEntity,
  AiMessageOrmEntity,
} from '../entities/typeorm/ai.entity';
import { TypeOrmAiRepository } from '../repositories/typeorm-ai.repository';

import type {
  AiTransactionRepositories,
  AiUnitOfWork,
} from '../../domain/repositories/unit-of-work';

@Injectable()
export class TypeOrmAiUnitOfWork implements AiUnitOfWork {
  constructor(private readonly dataSource: DataSource) {}
  execute<T>(
    work: (repositories: AiTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work({
        conversations: new TypeOrmAiRepository(
          manager.getRepository(AiConversationOrmEntity),
          manager.getRepository(AiMessageOrmEntity),
        ),
        lockOwner: (owner) => advisoryXactLock(manager, 'ai-owner', owner),
        appendEvent: (name, payload) =>
          appendOutboxEvent(manager, name, payload),
      }),
    );
  }
}
