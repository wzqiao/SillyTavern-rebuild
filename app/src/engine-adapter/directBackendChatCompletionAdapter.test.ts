import { describe, expect, it, vi } from 'vitest';
import { collectChatCompletionResult } from '@/services/chatRuntimeService';
import type { HeadlessChatCompletionRequest, HeadlessChatCompletionRuntimeConnection } from '@/contracts/engine';
import {
  DirectBackendChatCompletionError,
  createDirectBackendRequestBody,
  sendDirectBackendChatCompletion,
} from './directBackendChatCompletionAdapter';

const runtimeConnection: HeadlessChatCompletionRuntimeConnection = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.test/v1/',
  model: 'example-chat-model',
  apiKey: 'sk-memory-only-secret',
};

describe('directBackendChatCompletionAdapter', () => {
  it('builds the minimal OpenAI-compatible backend request body', () => {
    expect(createDirectBackendRequestBody({
      messages: [{ role: 'user', content: 'Ping' }],
      responseLength: 128,
      jsonSchema: {
        name: 'reply_shape',
        value: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
          },
        },
      },
    }, {
      ...runtimeConnection,
      baseUrl: 'https://api.example.test/v1',
    })).toEqual({
      chat_completion_source: 'openai',
      reverse_proxy: 'https://api.example.test/v1',
      proxy_password: 'sk-memory-only-secret',
      model: 'example-chat-model',
      messages: [{ role: 'user', content: 'Ping' }],
      stream: true,
      max_tokens: 128,
      json_schema: {
        name: 'reply_shape',
        strict: true,
        value: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
          },
        },
      },
    });
  });

  it('fetches CSRF, posts with same-origin credentials, and returns non-stream JSON', async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/csrf-token') {
        return jsonResponse({ token: 'csrf-token-1' });
      }

      expect(input).toBe('/api/backends/chat-completions/generate');
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'same-origin',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token-1',
        },
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        chat_completion_source: 'openai',
        reverse_proxy: 'https://api.example.test/v1',
        proxy_password: 'sk-memory-only-secret',
        model: 'example-chat-model',
        messages: [{ role: 'user', content: 'Ping' }],
        stream: false,
      });
      return jsonResponse({
        choices: [{ message: { content: 'Direct backend reply.' } }],
      });
    });

    await expect(sendDirectBackendChatCompletion(createRequest({
      stream: false,
      signal: abortController.signal,
    }), { fetch: fetcher })).resolves.toEqual({
      choices: [{ message: { content: 'Direct backend reply.' } }],
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, '/csrf-token', {
      method: 'GET',
      credentials: 'same-origin',
      signal: abortController.signal,
    });
  });

  it('normalizes OpenAI SSE chunks into cumulative runtime snapshots without exposing the API key', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (input === '/csrf-token') {
        return jsonResponse({ token: 'csrf-token-1' });
      }

      return new Response(toStream([
        'data: {"choices":[{"delta":{"content":"Hel"},"logprobs":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]), {
        status: 200,
      });
    });

    const rawResponse = await sendDirectBackendChatCompletion(createRequest(), { fetch: fetcher });
    await expect(collectChatCompletionResult(rawResponse)).resolves.toMatchObject({
      completed: true,
      text: 'Hello',
      source: 'stream',
      chunkCount: 2,
      finishReason: 'stop',
    });
    expect(JSON.stringify(rawResponse)).not.toContain(runtimeConnection.apiKey);
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining(runtimeConnection.apiKey));
    expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining(runtimeConnection.apiKey));

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it('throws sanitized errors for invalid connections and failed backend responses', async () => {
    await expect(sendDirectBackendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      runtimeConnection: {
        ...runtimeConnection,
        apiKey: '   ',
      },
    })).rejects.toMatchObject({
      name: 'DirectBackendChatCompletionError',
      message: 'Runtime connection must include baseUrl, model, and apiKey.',
    });

    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (input === '/csrf-token') {
        return jsonResponse({ token: 'csrf-token-1' });
      }

      return jsonResponse({ error: { message: runtimeConnection.apiKey } }, { status: 502, statusText: 'Bad Gateway' });
    });

    await expect(sendDirectBackendChatCompletion(createRequest(), { fetch: fetcher })).rejects.toEqual(
      new DirectBackendChatCompletionError('Direct backend chat completion failed with status 502 Bad Gateway.'),
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
