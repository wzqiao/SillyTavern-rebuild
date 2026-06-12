import type {
  HeadlessChatCompletionRequest,
  HeadlessChatCompletionRuntimeConnection,
  ReforgedChatCompletionMessage,
  ReforgedJsonSchema,
} from '@/contracts/engine';
import { createOpenAiSseStream } from './openAiSseStream';

export interface DirectBackendChatCompletionDependencies {
  fetch?: typeof fetch;
  endpoint?: string;
  csrfTokenEndpoint?: string;
}

interface DirectBackendChatCompletionRequestBody {
  chat_completion_source: 'openai';
  reverse_proxy: string;
  proxy_password: string;
  model: string;
  messages: ReforgedChatCompletionMessage[];
  stream: boolean;
  max_tokens?: number;
  json_schema?: DirectBackendJsonSchema;
}

interface DirectBackendJsonSchema {
  name: string;
  strict?: boolean;
  value: unknown;
}

const DEFAULT_ENDPOINT = '/api/backends/chat-completions/generate';
const DEFAULT_CSRF_TOKEN_ENDPOINT = '/csrf-token';

export async function sendDirectBackendChatCompletion(
  request: HeadlessChatCompletionRequest,
  dependencies: DirectBackendChatCompletionDependencies = {},
): Promise<unknown> {
  const runtimeConnection = normalizeRuntimeConnection(request.runtimeConnection);
  const fetcher = dependencies.fetch ?? globalThis.fetch;

  if (typeof fetcher !== 'function') {
    throw new DirectBackendChatCompletionError('Browser fetch() is required for direct backend chat completion.');
  }

  const csrfToken = await fetchCsrfToken(
    fetcher,
    dependencies.csrfTokenEndpoint ?? DEFAULT_CSRF_TOKEN_ENDPOINT,
    request.signal,
  );
  const response = await fetcher(dependencies.endpoint ?? DEFAULT_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(createDirectBackendRequestBody(request, runtimeConnection)),
    signal: request.signal,
  });

  if (!response.ok) {
    throw new DirectBackendChatCompletionError(
      `Direct backend chat completion failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
    );
  }

  if (request.stream !== false) {
    if (!response.body) {
      throw new DirectBackendChatCompletionError('Direct backend streaming response did not include a response body.');
    }

    return createOpenAiSseStream(response.body);
  }

  return response.json();
}

export function createDirectBackendRequestBody(
  request: HeadlessChatCompletionRequest,
  runtimeConnection: HeadlessChatCompletionRuntimeConnection,
): DirectBackendChatCompletionRequestBody {
  const jsonSchema = normalizeJsonSchema(request.jsonSchema);
  const baseUrl = runtimeConnection.baseUrl.trim().replace(/\/+$/g, '');
  const model = runtimeConnection.model.trim();
  const apiKey = runtimeConnection.apiKey.trim();
  const body: DirectBackendChatCompletionRequestBody = {
    chat_completion_source: 'openai',
    reverse_proxy: baseUrl,
    proxy_password: apiKey,
    model,
    messages: request.messages,
    stream: request.stream !== false,
  };

  if (request.responseLength != null) {
    body.max_tokens = request.responseLength;
  }

  if (jsonSchema) {
    body.json_schema = jsonSchema;
  }

  return body;
}

export class DirectBackendChatCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectBackendChatCompletionError';
  }
}

async function fetchCsrfToken(fetcher: typeof fetch, endpoint: string, signal: AbortSignal | undefined): Promise<string> {
  const response = await fetcher(endpoint, {
    method: 'GET',
    credentials: 'same-origin',
    signal,
  });

  if (!response.ok) {
    throw new DirectBackendChatCompletionError(
      `Could not get CSRF token for direct backend chat completion: ${response.status}.`,
    );
  }

  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.token !== 'string') {
    throw new DirectBackendChatCompletionError('CSRF token response did not include a token.');
  }

  return data.token;
}

function normalizeRuntimeConnection(
  connection: HeadlessChatCompletionRequest['runtimeConnection'],
): HeadlessChatCompletionRuntimeConnection {
  if (!connection) {
    throw new DirectBackendChatCompletionError('Runtime connection is required for direct backend chat completion.');
  }

  const baseUrl = connection.baseUrl.trim().replace(/\/+$/g, '');
  const model = connection.model.trim();
  const apiKey = connection.apiKey.trim();

  if (connection.provider !== 'openai-compatible') {
    throw new DirectBackendChatCompletionError('Only OpenAI-compatible runtime connections are supported.');
  }

  if (!baseUrl || !model || !apiKey) {
    throw new DirectBackendChatCompletionError('Runtime connection must include baseUrl, model, and apiKey.');
  }

  return {
    ...connection,
    baseUrl,
    model,
    apiKey,
  };
}

function normalizeJsonSchema(schema: ReforgedJsonSchema | null | undefined): DirectBackendJsonSchema | null {
  if (!schema || !('value' in schema)) {
    return null;
  }

  return {
    name: typeof schema.name === 'string' && schema.name.trim() ? schema.name : 'reforged_schema',
    strict: typeof schema.strict === 'boolean' ? schema.strict : true,
    value: schema.value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
