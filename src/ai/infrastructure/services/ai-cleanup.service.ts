import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class AiCleanupService {
  private readonly logger = new Logger(AiCleanupService.name);

  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldData() {
    try {
      this.logger.log('Starting AI data cleanup');

      // Conversations older than 12 months have their content deleted.
      // We assume conversations are deleted along with messages via ON DELETE CASCADE
      const conversationsResult = await this.em.query<[unknown[], number]>(
        `DELETE FROM ai_conversations WHERE "createdAt" < now() - interval '12 months'`,
      );

      this.logger.log(
        `Deleted ${conversationsResult[1]} old conversations (and their messages)`,
      );

      // Usage/cost data may remain for 24 months without message content.
      const costTrackingResult = await this.em.query<[unknown[], number]>(
        `DELETE FROM ai_cost_tracking WHERE "createdAt" < now() - interval '24 months'`,
      );
      this.logger.log(
        `Deleted ${costTrackingResult[1]} old cost tracking records`,
      );

      const dailyUsageResult = await this.em.query<[unknown[], number]>(
        `DELETE FROM ai_daily_usage WHERE day < current_date - interval '24 months'`,
      );
      this.logger.log(`Deleted ${dailyUsageResult[1]} old daily usage records`);

      this.logger.log('AI data cleanup finished');
    } catch (err) {
      this.logger.error(
        'Failed to cleanup AI data',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
