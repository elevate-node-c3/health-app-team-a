import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { ChatCompletionsAiProviderAdapter } from './chat-completions-ai-provider.adapter';

describe('AI provider streaming', () => {
  afterEach(() => jest.restoreAllMocks());

  it('decodes fragmented Arabic UTF-8 and usage events', async () => {
    const body =
      'data: {"choices":[{"delta":{"content":"مرحبا"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\ndata: [DONE]\n\n';
    const encoded = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < encoded.length; i += 3)
          controller.enqueue(encoded.slice(i, i + 3));
        controller.close();
      },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(stream));
    const provider = new ChatCompletionsAiProviderAdapter(
      new ConfigService({
        ai: {
          apiKey: 'server-secret',
          baseUrl: 'https://provider.example/v1',
          model: 'test',
        },
      }),
    );
    const chunks: unknown[] = [];
    for await (const chunk of provider.stream(
      [{ role: 'user', content: 'ألم' }],
      AbortSignal.timeout(1000),
    ))
      chunks.push(chunk);
    expect(chunks).toContainEqual({
      text: 'مرحبا',
      finish: undefined,
      usage: undefined,
    });
    expect(chunks).toContainEqual({
      text: undefined,
      finish: undefined,
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://provider.example/v1/chat/completions',
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer server-secret',
        'Content-Type': 'application/json',
      }),
    );
  });

  it('does not expose provider error details', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('sensitive provider diagnostics', { status: 500 }),
      );
    const provider = new ChatCompletionsAiProviderAdapter(
      new ConfigService({
        ai: { apiKey: 'server-secret', baseUrl: 'https://provider.example/v1' },
      }),
    );
    await expect(
      provider.stream([], AbortSignal.timeout(1000)).next(),
    ).rejects.toThrow('AI unavailable');
  });

  it('fails closed when a provider stream ends without its completion marker', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      );
    const provider = new ChatCompletionsAiProviderAdapter(
      new ConfigService({
        ai: { apiKey: 'secret', baseUrl: 'https://provider.example/v1' },
      }),
    );
    const stream = provider.stream([], AbortSignal.timeout(1000));
    expect((await stream.next()).value).toEqual({
      text: 'partial',
      finish: undefined,
      usage: undefined,
    });
    await expect(stream.next()).rejects.toThrow('Incomplete stream');
  });
});
