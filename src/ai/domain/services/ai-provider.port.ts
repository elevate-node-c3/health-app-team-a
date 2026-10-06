export interface ProviderChunk {
  text?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  finish?: string;
}

export interface AiProvider {
  stream(
    messages: { role: string; content: string }[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
