import type {
  HeadlessChatCompletionRequest,
  HeadlessChatCompletionRuntimeConnection,
  ReforgedChatCompletionMessage,
  ReforgedJsonSchema,
} from '@/contracts/engine';

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

interface DirectBackendStreamState {
  text: string;
  reasoning: string;
  reasoningSignature: string | null;
  toolCalls: unknown[];
  toolSignatures: Record<string, string>;
  logprobs: unknown;
  finishReason: string | null;
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

    return createDirectBackendStream(response.body);
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

async function* createDirectBackendStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: DirectBackendStreamState = {
    text: '',
    reasoning: '',
    reasoningSignature: null,
    toolCalls: [],
    toolSignatures: {},
    logprobs: null,
    finishReason: null,
  };
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      for (const event of events) {
        const snapshot = readStreamEvent(event, state);
        if (snapshot) {
          yield snapshot;
        }
      }

      if (done) {
        const finalSnapshot = readStreamEvent(buffer, state);
        if (finalSnapshot) {
          yield finalSnapshot;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function readStreamEvent(event: string, state: DirectBackendStreamState): unknown | null {
  const dataLines = event
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join('\n');
  if (!rawData || rawData === '[DONE]') {
    return null;
  }

  const parsed: unknown = JSON.parse(rawData);
  if (!isRecord(parsed)) {
    return null;
  }

  mergeDirectBackendChunk(state, parsed);

  return {
    text: state.text,
    reasoning: state.reasoning,
    reasoningSignature: state.reasoningSignature,
    logprobs: state.logprobs,
    finishReason: state.finishReason,
    toolCalls: state.toolCalls,
    state: {
      reasoning: state.reasoning,
      signature: state.reasoningSignature ?? '',
      toolSignatures: state.toolSignatures,
      images: [],
    },
  };
}

function mergeDirectBackendChunk(state: DirectBackendStreamState, chunk: Record<string, unknown>): void {
  const choices = Array.isArray(chunk.choices) ? chunk.choices.filter(isRecord) : [];
  const firstChoice = choices[0] ?? {};
  const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};
  const message = isRecord(firstChoice.message) ? firstChoice.message : {};

  state.text += readContentDelta(delta.content) ?? readContentDelta(message.content) ?? readString(firstChoice.text) ?? '';
  state.reasoning += readString(delta.reasoning) ?? readString(delta.reasoning_content) ?? '';
  state.reasoningSignature = readString(delta.reasoning_signature) ?? state.reasoningSignature;
  state.logprobs = firstChoice.logprobs ?? state.logprobs;
  state.finishReason = readString(firstChoice.finish_reason) ?? state.finishReason;

  const toolCalls = Array.isArray(delta.tool_calls)
    ? delta.tool_calls
    : Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];

  if (toolCalls.length > 0) {
    state.toolCalls = toolCalls;
  }
}

function readContentDelta(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((part) => isRecord(part) && typeof part.text === 'string' ? part.text : '')
    .join('');

  return text || null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
