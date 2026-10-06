export interface AiConversationStartedEvent {
  conversationId: string;
}

export interface AiMessageAnsweredEvent {
  conversationId: string;
  messageId: string;
  outcome: string;
  [key: string]: unknown;
}
