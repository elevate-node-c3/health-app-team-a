export interface AiConversationStartedEvent {
  conversationId: string;
  [key: string]: unknown;
}

export interface AiMessageAnsweredEvent {
  conversationId: string;
  messageId: string;
  outcome: string;
  [key: string]: unknown;
}
