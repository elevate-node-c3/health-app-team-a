import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AiProvider,
  ProviderChunk,
  AiMessageParam,
  AiTool,
} from '../../domain/services/ai-provider.port';

@Injectable()
export class ChatCompletionsAiProviderAdapter implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async *stream(
    messages: AiMessageParam[],
    signal: AbortSignal,
    tools?: AiTool[],
  ): AsyncGenerator<ProviderChunk> {
    const response = await this.requestCompletion(messages, signal, tools);
    yield* this.readChunks(response.body!);
  }

  private async requestCompletion(
    messages: AiMessageParam[],
    signal: AbortSignal,
    tools?: AiTool[],
  ): Promise<Response> {
    const key = this.config.get<string>('ai.apiKey');
    if (!key) throw new Error('AI unavailable');
    const response = await fetch(
      `${this.config.get<string>('ai.baseUrl')}/chat/completions`,
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('ai.model'),
          messages,
          ...(tools && tools.length > 0 ? { tools } : {}),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: 1500,
        }),
      },
    );
    if (!response.ok || !response.body) throw new Error('AI unavailable');
    return response;
  }

  private async *readChunks(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<ProviderChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    try {
      while (!done) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > 100000) throw new Error('Invalid stream');
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            done = true;
            break;
          }
          yield this.parseChunk(data);
        }
      }
      if (!done) throw new Error('Incomplete stream');
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  private parseChunk(data: string): ProviderChunk {
    const event = JSON.parse(data) as {
      choices?: {
        delta?: {
          content?: string;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        finish_reason?: string;
      }[];
      usage?: ProviderChunk['usage'];
    };

    let toolCalls: ProviderChunk['toolCalls'];
    if (event.choices?.[0]?.delta?.tool_calls) {
      // `id`/`name` are forwarded as undefined when absent rather than ''
      // so the accumulator can tell "not sent on this delta" from "empty".
      toolCalls = event.choices[0].delta.tool_calls.map((tc, position) => ({
        index: tc.index ?? position,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments ?? '',
      }));
    }

    return {
      text: event.choices?.[0]?.delta?.content,
      finish: event.choices?.[0]?.finish_reason,
      usage: event.usage,
      toolCalls,
    };
  }
}
