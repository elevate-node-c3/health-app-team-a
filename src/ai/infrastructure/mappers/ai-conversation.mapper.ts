import { AiConversation } from '../../domain/entities/ai.model';
import { AiConversationOrmEntity } from '../entities/typeorm/ai-conversation.entity';
export class AiConversationMapper {
  static toDomain(this: void, row: AiConversationOrmEntity): AiConversation {
    return new AiConversation(row.id, row.owner, row.createdAt);
  }
}
