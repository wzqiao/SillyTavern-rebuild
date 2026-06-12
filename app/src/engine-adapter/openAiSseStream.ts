interface OpenAiSseStreamState {
  text: string;
  reasoning: string;
  reasoningSignature: string | null;
  toolCalls: Record<string, unknown>[];
  toolSignatures: Record<string, string>;
  logprobs: unknown;
  finishReason: string | null;
}

export async function* createOpenAiSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: OpenAiSseStreamState = {
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

function readStreamEvent(event: string, state: OpenAiSseStreamState): unknown | null {
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

  mergeOpenAiSseChunk(state, parsed);

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

function mergeOpenAiSseChunk(state: OpenAiSseStreamState, chunk: Record<string, unknown>): void {
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
    mergeToolCallDeltas(state, toolCalls);
  }
}

function mergeToolCallDeltas(state: OpenAiSseStreamState, deltas: unknown[]): void {
  for (const [fallbackIndex, item] of deltas.entries()) {
    if (!isRecord(item)) {
      continue;
    }

    const index = typeof item.index === 'number' && Number.isInteger(item.index)
      ? item.index
      : fallbackIndex;
    const existing = state.toolCalls[index] ?? {};
    const existingFunction = isRecord(existing.function) ? existing.function : {};
    const deltaFunction = isRecord(item.function) ? item.function : {};
    const nextFunction = {
      ...existingFunction,
      ...deltaFunction,
    };
    const existingArguments = readString(existingFunction.arguments) ?? '';
    const deltaArguments = readString(deltaFunction.arguments) ?? '';

    if (existingArguments || deltaArguments) {
      nextFunction.arguments = `${existingArguments}${deltaArguments}`;
    }

    state.toolCalls[index] = {
      ...existing,
      ...item,
      function: nextFunction,
    };
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
