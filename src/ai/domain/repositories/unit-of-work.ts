import type { AiRepository } from './ai.repository';

export interface AiTransactionRepositories {
  conversations: AiRepository;
  lockOwner(this: void, owner: string): Promise<void>;
  appendEvent(
    this: void,
    name: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export interface AiUnitOfWork {
  execute<T>(
    work: (repositories: AiTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}

export const AI_UNIT_OF_WORK = Symbol('AI_UNIT_OF_WORK');
