import { describe, expect, it, vi } from 'vitest';
import { collectChatCompletionResult } from '@/services/chatRuntimeService';
import type { HeadlessChatCompletionRequest, HeadlessChatCompletionRuntimeConnection } from '@/contracts/engine';
import {
  ReforgedBackendChatCompletionError,
  createReforgedBackendRequestBody,
  sendReforgedBackendChatCompletion,
} from './reforgedBackendChatCompletionAdapter';

const runtimeConnection: HeadlessChatCompletionRuntimeConnection = {
  provider: 'openai-compatible',
  baseUrl: 'https://provider.example.test/v1/',
  model: 'example-chat-model',
  apiKey: 'sk-memory-only-secret',
  transport: 'reforged-backend',
};

describe('reforgedBackendChatCompletionAdapter', () => {
  it('builds a Reforged backend request body without the raw key', () => {
    const body = createReforgedBackendRequestBody(createRequest({
      responseLength: 123,
      jsonSchema: { name: 'reply_shape', value: { type: 'object' } },
      sampling: {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.1,
        maxTokens: 456,
      },
    }), {
      ...runtimeConnection,
      baseUrl: ' https://provider.example.test/v1/ ',
      model: ' example-chat-model ',
    });

    expect(body).toEqual({
      baseUrl: 'https://provider.example.test/v1',
      model: 'example-chat-model',
      messages: [{ role: 'user', content: 'Ping' }],
      stream: true,
      sampling: {
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1,
      },
      max_tokens: 123,
      response_format: {
        type: 'json_object',
      },
    });
    expect(JSON.stringify(body)).not.toContain('sk-memory-only-secret');
  });

  it('posts to the Reforged backend with bearer auth and no key in the body', async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('http://127.0.0.1:8787/api/reforged/chat/completions');
      expect(init).toMatchObject({
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-memory-only-secret',
        },
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        baseUrl: 'https://provider.example.test/v1',
        model: 'example-chat-model',
        messages: [{ role: 'user', content: 'Ping' }],
        stream: false,
      });
      expect(JSON.stringify(body)).not.toContain('sk-memory-only-secret');

      return jsonResponse({
        choices: [{ message: { content: 'Reforged reply.' } }],
      });
    });

    await expect(sendReforgedBackendChatCompletion(createRequest({
      stream: false,
      signal: abortController.signal,
    }), { fetch: fetcher })).resolves.toEqual({
      choices: [{ message: { content: 'Reforged reply.' } }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('normalizes Reforged backend SSE with the shared OpenAI parser', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(toStream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    }));

    const rawResponse = await sendReforgedBackendChatCompletion(createRequest(), { fetch: fetcher });
    await expect(collectChatCompletionResult(rawResponse)).resolves.toMatchObject({
      completed: true,
      text: 'Hello',
      source: 'stream',
      chunkCount: 2,
      finishReason: 'stop',
    });
  });

  it('surfaces sanitized backend errors', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      error: 'Provider returned HTTP 401.',
    }, {
      status: 401,
      statusText: 'Unauthorized',
    }));

    await expect(sendReforgedBackendChatCompletion(createRequest(), { fetch: fetcher })).rejects.toEqual(
      new ReforgedBackendChatCompletionError('Provider returned HTTP 401.', 401),
    );
  });
});

function createRequest(overrides: Partial<HeadlessChatCompletionRequest> = {}): HeadlessChatCompletionRequest {
  return {
    messages: [{ role: 'user', content: 'Ping' }],
    runtimeConnection,
    ...overrides,
  };
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
