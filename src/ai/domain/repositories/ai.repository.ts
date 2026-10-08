import type {
  AiConversation,
  AiMessage,
  AiOutcome,
} from '../entities/ai.model';

export interface AiRepository {
  findConversation(id: string, owner: string): Promise<AiConversation | null>;
  listConversations(owner: string): Promise<AiConversation[]>;
  createConversation(conversation: AiConversation): Promise<AiConversation>;
  hasGuestConversations(device: string): Promise<boolean>;
  claimGuest(device: string, userId: string): Promise<void>;
  listMessages(conversationId: string): Promise<AiMessage[]>;
  recentCompletedMessages(conversationId: string): Promise<AiMessage[]>;
  findMessage(
    conversationId: string,
    messageId: string,
  ): Promise<AiMessage | null>;
  findRequest(
    conversationId: string,
    requestId: string,
  ): Promise<AiMessage | null>;
  countMessages(conversationId: string, outcome?: AiOutcome): Promise<number>;
  createMessage(message: AiMessage): Promise<AiMessage>;
  persistContent(messageId: string, content: string): Promise<void>;
  completeMessage(
    message: AiMessage,
    outcome: AiOutcome,
    metrics: Record<string, unknown>,
  ): Promise<boolean>;
  consumeDailyQuota(owner: string, limit: number): Promise<boolean>;
}

export const AI_REPOSITORY = Symbol('AI_REPOSITORY');
