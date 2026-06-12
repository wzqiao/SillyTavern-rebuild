// DRAFT: 待主干评审

import type {
  HeadlessChatCompletionRequest,
  HeadlessChatCompletionRuntimeConnection,
  ReforgedChatCompletionMessage,
} from '@/contracts/engine';
import { createOpenAiSseStream } from './openAiSseStream';

export type BrowserDirectFailureKind = 'config' | 'cors-or-network' | 'http';

export class BrowserDirectChatCompletionError extends Error {
  constructor(
    public readonly kind: BrowserDirectFailureKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BrowserDirectChatCompletionError';
  }
}

export interface BrowserDirectDependencies {
  fetch?: typeof fetch;
}

interface BrowserDirectChatCompletionRequestBody {
  model: string;
  messages: ReforgedChatCompletionMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  top_a?: number;
  min_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  seed?: number;
  response_format?: {
    type: 'json_object';
  };
}

export async function sendBrowserDirectChatCompletion(
  request: HeadlessChatCompletionRequest,
  dependencies: BrowserDirectDependencies = {},
): Promise<unknown> {
  const runtimeConnection = normalizeRuntimeConnection(request.runtimeConnection);
  const fetcher = dependencies.fetch ?? globalThis.fetch;

  if (typeof fetcher !== 'function') {
    throw new BrowserDirectChatCompletionError('config', 'Browser fetch() is required for browser direct chat completion.');
  }

  const url = resolveChatCompletionsUrl(runtimeConnection.baseUrl);
  const body = createBrowserDirectRequestBody(request, runtimeConnection);
  let response: Response;

  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtimeConnection.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new BrowserDirectChatCompletionError(
        'cors-or-network',
        `Browser direct request could not reach the upstream endpoint: ${describeError(error)}`,
      );
    }

    throw error;
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const detail = responseText.trim() ? ` ${responseText.trim().slice(0, 200)}` : '';
    throw new BrowserDirectChatCompletionError(
      'http',
      `Browser direct chat completion failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.${detail}`,
      response.status,
    );
  }

  if (request.stream !== false) {
    if (!response.body) {
      throw new BrowserDirectChatCompletionError('http', 'Browser direct streaming response did not include a response body.');
    }

    return createOpenAiSseStream(response.body);
  }

  return response.json();
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/g, '');

  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

export function createBrowserDirectRequestBody(
  request: HeadlessChatCompletionRequest,
  runtimeConnection: HeadlessChatCompletionRuntimeConnection,
): BrowserDirectChatCompletionRequestBody {
  const body: BrowserDirectChatCompletionRequestBody = {
    model: runtimeConnection.model.trim(),
    messages: request.messages,
    stream: request.stream !== false,
  };

  if (request.responseLength != null) {
    body.max_tokens = request.responseLength;
  }

  applySamplingParams(body, request.sampling);

  if (request.jsonSchema) {
    body.response_format = {
      type: 'json_object',
    };
  }

  return body;
}

function applySamplingParams(
  body: BrowserDirectChatCompletionRequestBody,
  sampling: HeadlessChatCompletionRequest['sampling'],
): void {
  if (!sampling) {
    return;
  }

  if (sampling.temperature != null) body.temperature = sampling.temperature;
  if (sampling.topP != null) body.top_p = sampling.topP;
  if (sampling.topK != null) body.top_k = sampling.topK;
  if (sampling.topA != null) body.top_a = sampling.topA;
  if (sampling.minP != null) body.min_p = sampling.minP;
  if (sampling.frequencyPenalty != null) body.frequency_penalty = sampling.frequencyPenalty;
  if (sampling.presencePenalty != null) body.presence_penalty = sampling.presencePenalty;
  if (sampling.repetitionPenalty != null) body.repetition_penalty = sampling.repetitionPenalty;
  if (sampling.seed != null) body.seed = sampling.seed;
  if (sampling.maxTokens != null && body.max_tokens == null) body.max_tokens = sampling.maxTokens;
}

function normalizeRuntimeConnection(
  connection: HeadlessChatCompletionRequest['runtimeConnection'],
): HeadlessChatCompletionRuntimeConnection {
  if (!connection) {
    throw new BrowserDirectChatCompletionError('config', 'Runtime connection is required for browser direct chat completion.');
  }

  const baseUrl = connection.baseUrl.trim().replace(/\/+$/g, '');
  const model = connection.model.trim();
  const apiKey = connection.apiKey.trim();

  if (connection.provider !== 'openai-compatible') {
    throw new BrowserDirectChatCompletionError('config', 'Only OpenAI-compatible runtime connections are supported.');
  }

  if (!baseUrl || !model || !apiKey) {
    throw new BrowserDirectChatCompletionError('config', 'Runtime connection must include baseUrl, model, and apiKey.');
  }

  return {
    ...connection,
    baseUrl,
    model,
    apiKey,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
