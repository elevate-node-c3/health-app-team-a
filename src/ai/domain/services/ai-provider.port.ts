export interface ProviderChunk {
  text?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  finish?: string;
  /**
   * Streamed tool-call deltas. `index` is the only field present on every
   * delta: providers send `id` and `name` once, on the first delta of each
   * call, then stream `arguments` fragments carrying `index` alone. Consumers
   * must accumulate by `index`, never by `id`.
   */
  toolCalls?: {
    index: number;
    id?: string;
    name?: string;
    arguments: string;
  }[];
}

export interface AiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type AiMessageParam =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface AiProvider {
  stream(
    messages: AiMessageParam[],
    signal: AbortSignal,
    tools?: AiTool[],
  ): AsyncIterable<ProviderChunk>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
