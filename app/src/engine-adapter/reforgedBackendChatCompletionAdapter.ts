// DRAFT: 待主干评审

import type {
  HeadlessChatCompletionRequest,
  HeadlessChatCompletionRuntimeConnection,
  ReforgedChatCompletionMessage,
  ReforgedJsonSchema,
} from '@/contracts/engine';
import { normalizeReforgedHttpBaseUrl, type ReforgedRuntimeClientOptions } from '@/services/reforgedRuntimeClient';
import { createOpenAiSseStream } from './openAiSseStream';

export interface ReforgedBackendChatCompletionDependencies extends ReforgedRuntimeClientOptions {
  endpoint?: string;
}

interface ReforgedBackendChatCompletionRequestBody {
  baseUrl: string;
  model: string;
  messages: ReforgedChatCompletionMessage[];
  stream: boolean;
  sampling?: Record<string, unknown>;
  max_tokens?: number;
  response_format?: {
    type: 'json_object';
  };
}

const DEFAULT_ENDPOINT = '/api/reforged/chat/completions';

export class ReforgedBackendChatCompletionError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ReforgedBackendChatCompletionError';
  }
}

export async function sendReforgedBackendChatCompletion(
  request: HeadlessChatCompletionRequest,
  dependencies: ReforgedBackendChatCompletionDependencies = {},
): Promise<unknown> {
  const runtimeConnection = normalizeRuntimeConnection(request.runtimeConnection);
  const fetcher = dependencies.fetch ?? globalThis.fetch;

  if (typeof fetcher !== 'function') {
    throw new ReforgedBackendChatCompletionError('Browser fetch() is required for Reforged backend chat completion.');
  }

  const baseUrl = normalizeReforgedHttpBaseUrl(dependencies.baseUrl);
  const endpoint = dependencies.endpoint ?? DEFAULT_ENDPOINT;
  let response: Response;

  try {
    response = await fetcher(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtimeConnection.apiKey}`,
      },
      body: JSON.stringify(createReforgedBackendRequestBody(request, runtimeConnection)),
      signal: request.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ReforgedBackendChatCompletionError(`Reforged backend request failed: ${describeError(error)}`);
  }

  if (!response.ok) {
    const message = await readSanitizedErrorMessage(response);
    throw new ReforgedBackendChatCompletionError(message, response.status);
  }

  if (request.stream !== false) {
    if (!response.body) {
      throw new ReforgedBackendChatCompletionError('Reforged backend streaming response did not include a response body.');
    }

    return createOpenAiSseStream(response.body);
  }

  return response.json();
}

export function createReforgedBackendRequestBody(
  request: HeadlessChatCompletionRequest,
  runtimeConnection: HeadlessChatCompletionRuntimeConnection,
): ReforgedBackendChatCompletionRequestBody {
  const body: ReforgedBackendChatCompletionRequestBody = {
    baseUrl: runtimeConnection.baseUrl.trim().replace(/\/+$/g, ''),
    model: runtimeConnection.model.trim(),
    messages: request.messages,
    stream: request.stream !== false,
  };
  const sampling = createSamplingPayload(request);

  if (Object.keys(sampling).length > 0) {
    body.sampling = sampling;
  }

  if (request.responseLength != null) {
    body.max_tokens = request.responseLength;
  }

  if (request.jsonSchema) {
    body.response_format = {
      type: 'json_object',
    };
  }

  return body;
}

function createSamplingPayload(request: HeadlessChatCompletionRequest): Record<string, unknown> {
  const sampling = request.sampling;
  const payload: Record<string, unknown> = {};

  if (!sampling) {
    return payload;
  }

  if (sampling.temperature != null) payload.temperature = sampling.temperature;
  if (sampling.topP != null) payload.top_p = sampling.topP;
  if (sampling.topK != null) payload.top_k = sampling.topK;
  if (sampling.topA != null) payload.top_a = sampling.topA;
  if (sampling.minP != null) payload.min_p = sampling.minP;
  if (sampling.frequencyPenalty != null) payload.frequency_penalty = sampling.frequencyPenalty;
  if (sampling.presencePenalty != null) payload.presence_penalty = sampling.presencePenalty;
  if (sampling.repetitionPenalty != null) payload.repetition_penalty = sampling.repetitionPenalty;
  if (sampling.seed != null) payload.seed = sampling.seed;
  if (sampling.maxTokens != null && request.responseLength == null) payload.max_tokens = sampling.maxTokens;

  return payload;
}

function normalizeRuntimeConnection(
  connection: HeadlessChatCompletionRequest['runtimeConnection'],
): HeadlessChatCompletionRuntimeConnection {
  if (!connection) {
    throw new ReforgedBackendChatCompletionError('Runtime connection is required for Reforged backend chat completion.');
  }

  const baseUrl = connection.baseUrl.trim().replace(/\/+$/g, '');
  const model = connection.model.trim();
  const apiKey = connection.apiKey.trim();

  if (connection.provider !== 'openai-compatible') {
    throw new ReforgedBackendChatCompletionError('Only OpenAI-compatible runtime connections are supported.');
  }

  if (!baseUrl || !model || !apiKey) {
    throw new ReforgedBackendChatCompletionError('Runtime connection must include baseUrl, model, and apiKey.');
  }

  return {
    ...connection,
    baseUrl,
    model,
    apiKey,
  };
}

async function readSanitizedErrorMessage(response: Response): Promise<string> {
  const fallback = `Reforged backend chat completion failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`;
  const payload = await readJson(response);

  if (isRecord(payload)) {
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }

    if (isRecord(payload.error) && typeof payload.error.message === 'string' && payload.error.message.trim()) {
      return payload.error.message.trim();
    }
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
