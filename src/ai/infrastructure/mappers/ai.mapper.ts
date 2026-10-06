import {
  AiConversation,
  AiMessage,
  type AiOutcome,
} from '../../domain/entities/ai.model';
import {
  AiConversationOrmEntity,
  AiMessageOrmEntity,
} from '../entities/typeorm/ai.entity';

export class AiMapper {
  static conversation(
    this: void,
    row: AiConversationOrmEntity,
  ): AiConversation {
    return new AiConversation(row.id, row.owner, row.createdAt);
  }

  static message(this: void, row: AiMessageOrmEntity): AiMessage {
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
