import { describe, expect, it, vi } from 'vitest';
import { collectChatCompletionResult } from '@/services/chatRuntimeService';
import type { HeadlessChatCompletionRequest, HeadlessChatCompletionRuntimeConnection } from '@/contracts/engine';
import {
  BrowserDirectChatCompletionError,
  createBrowserDirectRequestBody,
  resolveChatCompletionsUrl,
  sendBrowserDirectChatCompletion,
} from './browserDirectChatCompletionAdapter';

const runtimeConnection: HeadlessChatCompletionRuntimeConnection = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.test/v1/',
  model: 'example-chat-model',
  apiKey: 'sk-memory-only-secret',
};

describe('browserDirectChatCompletionAdapter', () => {
  it('resolves OpenAI chat completion URLs without duplicating path segments', () => {
    expect(resolveChatCompletionsUrl('https://a/v1')).toBe('https://a/v1/chat/completions');
    expect(resolveChatCompletionsUrl('https://a/v1/')).toBe('https://a/v1/chat/completions');
    expect(resolveChatCompletionsUrl('https://a/v1/chat/completions')).toBe('https://a/v1/chat/completions');
    expect(resolveChatCompletionsUrl('https://a/v1/chat/completions/')).toBe('https://a/v1/chat/completions');
  });

  it('builds a standard OpenAI-compatible request body with sampling fields', () => {
    expect(createBrowserDirectRequestBody(createRequest({
      responseLength: null,
      jsonSchema: {
        name: 'reply_shape',
        value: { type: 'object' },
      },
      sampling: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        topA: 0.2,
        minP: 0.05,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        repetitionPenalty: 1.05,
        seed: 1234,
        maxTokens: 321,
      },
    }), {
      ...runtimeConnection,
      model: ' example-chat-model ',
    })).toEqual({
      model: 'example-chat-model',
      messages: [{ role: 'user', content: 'Ping' }],
      stream: true,
      max_tokens: 321,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      top_a: 0.2,
      min_p: 0.05,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      repetition_penalty: 1.05,
      seed: 1234,
      response_format: {
        type: 'json_object',
      },
    });
  });

  it('posts directly with bearer auth, no CSRF header, and returns non-stream JSON', async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('https://api.example.test/v1/chat/completions');
      expect(init).toMatchObject({
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-memory-only-secret',
        },
      });
      expect(init).not.toMatchObject({
        headers: {
          'X-CSRF-Token': expect.any(String),
        },
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'example-chat-model',
        messages: [{ role: 'user', content: 'Ping' }],
        stream: false,
        max_tokens: 128,
        temperature: 0.5,
      });

      return jsonResponse({
        choices: [{ message: { content: 'Browser direct reply.' } }],
      });
    });

    await expect(sendBrowserDirectChatCompletion(createRequest({
      stream: false,
      signal: abortController.signal,
      responseLength: 128,
      sampling: {
        temperature: 0.5,
      },
    }), { fetch: fetcher })).resolves.toEqual({
      choices: [{ message: { content: 'Browser direct reply.' } }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('normalizes browser direct OpenAI SSE snapshots', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(toStream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]), {
      status: 200,
    }));

    const rawResponse = await sendBrowserDirectChatCompletion(createRequest(), { fetch: fetcher });
    await expect(collectChatCompletionResult(rawResponse)).resolves.toMatchObject({
      completed: true,
      text: 'Hello',
      source: 'stream',
      chunkCount: 2,
      finishReason: 'stop',
    });
  });

  it('classifies fetch TypeError failures as cors-or-network', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(sendBrowserDirectChatCompletion(createRequest(), { fetch: fetcher })).rejects.toMatchObject({
      name: 'BrowserDirectChatCompletionError',
      kind: 'cors-or-network',
    });
  });

  it('classifies HTTP failures without marking them fallback-eligible', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      error: {
        message: 'invalid key',
      },
    }, {
      status: 401,
      statusText: 'Unauthorized',
    }));

    await expect(sendBrowserDirectChatCompletion(createRequest(), { fetch: fetcher })).rejects.toEqual(
      new BrowserDirectChatCompletionError(
        'http',
        'Browser direct chat completion failed with status 401 Unauthorized. {"error":{"message":"invalid key"}}',
        401,
      ),
    );
  });

  it('rethrows AbortError unchanged', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw abortError;
    });

    await expect(sendBrowserDirectChatCompletion(createRequest(), { fetch: fetcher })).rejects.toBe(abortError);
    await expect(sendBrowserDirectChatCompletion(createRequest(), { fetch: fetcher })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('throws config errors for unsupported or incomplete runtime connections', async () => {
    await expect(sendBrowserDirectChatCompletion(createRequest({
      runtimeConnection: {
        ...runtimeConnection,
        apiKey: '   ',
      },
    }))).rejects.toMatchObject({
      name: 'BrowserDirectChatCompletionError',
      kind: 'config',
      message: 'Runtime connection must include baseUrl, model, and apiKey.',
    });
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
