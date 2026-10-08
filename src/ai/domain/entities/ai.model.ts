export type AiOutcome = 'streaming' | 'completed' | 'failed' | 'interrupted';

export class AiConversation {
  constructor(
    public id: string,
    public owner: string,
    public createdAt: Date,
  ) {}
}

export class AiMessage {
  constructor(
    public id: string,
    public conversationId: string,
    public requestId: string,
    public input: string,
    public content: string,
    public outcome: AiOutcome,
    public suggestion: Record<string, unknown> | null,
    public metrics: Record<string, unknown> | null,
    public createdAt: Date,
  ) {}
}
