import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EntityManager } from 'typeorm';

import { AiCleanupService } from './ai-cleanup.service';

describe('AiCleanupService', () => {
  let service: AiCleanupService;
  let entityManager: jest.Mocked<Partial<EntityManager>>;

  beforeEach(() => {
    entityManager = {
      query: jest.fn<() => Promise<any>>().mockResolvedValue([[], 5]), // Mocking that 5 rows were deleted
    };
    service = new AiCleanupService(entityManager as unknown as EntityManager);
  });

  it('should delete conversations older than 12 months', async () => {
    await service.cleanupOldData();

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DELETE FROM ai_conversations WHERE "createdAt" < now() - interval \'12 months\'',
      ),
    );
  });

  it('should delete cost tracking records older than 24 months', async () => {
    await service.cleanupOldData();

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DELETE FROM ai_cost_tracking WHERE "createdAt" < now() - interval \'24 months\'',
      ),
    );
  });

  it('should delete daily usage records older than 24 months', async () => {
    await service.cleanupOldData();

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "DELETE FROM ai_daily_usage WHERE day < current_date - interval '24 months'",
      ),
    );
  });
});
