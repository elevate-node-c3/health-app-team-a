import { AiMessage, type AiOutcome } from '../../domain/entities/ai.model';
import { AiMessageOrmEntity } from '../entities/typeorm/ai-message.entity';
export class AiMessageMapper {
  static toDomain(this: void, row: AiMessageOrmEntity): AiMessage {
    return new AiMessage(
      row.id,
      row.conversationId,
      row.requestId,
      row.input,
      row.content,
      row.outcome as AiOutcome,
      row.suggestion,
      row.metrics,
      row.createdAt,
    );
  }
}
