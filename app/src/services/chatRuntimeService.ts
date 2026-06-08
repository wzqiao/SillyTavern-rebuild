import type {
    HeadlessChatCompletionRequest,
    HeadlessEngineAdapter,
} from '@/contracts/engine';
import type {
    ReforgedChatRuntimeEvent,
    ReforgedChatRuntimeRequestInput,
    ReforgedChatRuntimeResult,
    ReforgedChatRuntimeSnapshot,
    ReforgedChatRuntimeSource,
    ReforgedChatRuntimeToolCall,
} from '@/contracts/chat';
import { createChatEngineMessages } from './chatGenerationService';

export class ReforgedChatRuntimeNormalizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReforgedChatRuntimeNormalizationError';
    }
}

export function createChatCompletionRequest(input: ReforgedChatRuntimeRequestInput): HeadlessChatCompletionRequest {
    return {
        messages: createChatEngineMessages(input.session, input.messages, input.generation, input.lorebooks),
        type: input.type ?? 'quiet',
        signal: input.signal,
        jsonSchema: input.generation?.jsonSchema ?? null,
    };
}

export async function sendChatRuntimeCompletion(
    adapter: HeadlessEngineAdapter,
    input: ReforgedChatRuntimeRequestInput,
): Promise<ReforgedChatRuntimeResult> {
    const rawResponse = await adapter.sendChatCompletion(createChatCompletionRequest(input));
    return collectChatCompletionResult(rawResponse);
}

export async function collectChatCompletionResult(rawResponse: unknown): Promise<ReforgedChatRuntimeResult> {
    let result: ReforgedChatRuntimeResult | null = null;

    for await (const event of normalizeChatCompletionEvents(rawResponse)) {
        if (event.type === 'complete') {
            result = event.result;
        }
    }

    if (!result) {
        throw new ReforgedChatRuntimeNormalizationError('Chat completion response did not produce a final result.');
    }

    return result;
}

export async function* normalizeChatCompletionEvents(rawResponse: unknown): AsyncGenerator<ReforgedChatRuntimeEvent> {
    const stream = getAsyncStream(rawResponse);

    if (stream) {
        let snapshot = createEmptySnapshot('stream');
        let chunkCount = 0;

        try {
            for await (const chunk of stream) {
                chunkCount += 1;
                snapshot = normalizeStreamChunk(chunk, chunkCount);
                yield {
                    type: 'snapshot',
                    snapshot,
                };
            }
        } catch (error) {
            throw new ReforgedChatRuntimeNormalizationError(`Chat completion stream failed: ${describeError(error)}`);
        }

        yield {
            type: 'complete',
            result: completeSnapshot(snapshot),
        };
        return;
    }

    yield {
        type: 'complete',
        result: normalizeNonStreamResult(rawResponse),
    };
}

function getAsyncStream(value: unknown): AsyncIterable<unknown> | null {
    if (isAsyncIterable(value)) {
        return value;
    }

    if (typeof value === 'function') {
        const stream = value();
        if (isAsyncIterable(stream)) {
            return stream;
        }
    }

    return null;
}

function normalizeStreamChunk(chunk: unknown, chunkCount: number): ReforgedChatRuntimeSnapshot {
    const record = isRecord(chunk) ? chunk : {};
    const state = isRecord(record.state) ? record.state : {};

    return {
        text: readString(record.text) ?? readCompletionText(record) ?? '',
        alternatives: readStringArray(record.swipes) ?? readStringArray(record.alternatives) ?? [],
        reasoning: readString(record.reasoning) ?? readString(state.reasoning) ?? '',
        reasoningSignature: readString(record.reasoningSignature) ?? readString(state.signature),
        images: readStringArray(record.images) ?? readStringArray(state.images) ?? [],
        toolCalls: normalizeToolCalls(record.toolCalls, readToolSignatures(state)),
        toolSignatures: readToolSignatures(state),
        logprobs: record.logprobs ?? null,
        finishReason: readFinishReason(record),
        source: 'stream',
        chunkCount,
    };
}

function normalizeNonStreamResult(rawResponse: unknown): ReforgedChatRuntimeResult {
    if (typeof rawResponse === 'string') {
        return completeSnapshot({
            ...createEmptySnapshot('text'),
            text: rawResponse,
            chunkCount: 1,
        });
    }

    if (!isRecord(rawResponse)) {
        throw new ReforgedChatRuntimeNormalizationError('Unsupported chat completion response shape.');
    }

    const choices = Array.isArray(rawResponse.choices)
        ? rawResponse.choices.filter(isRecord)
        : [];
    const firstChoice = choices[0] ?? {};
    const message = isRecord(firstChoice.message) ? firstChoice.message : {};
    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};
    const directMessage = isRecord(rawResponse.message) ? rawResponse.message : {};
    const responseContent = isRecord(rawResponse.responseContent) ? rawResponse.responseContent : {};

    const text =
        readCompletionContent(message.content) ??
        readCompletionContent(delta.content) ??
        readString(firstChoice.text) ??
        readCompletionContent(directMessage.content) ??
        readString(rawResponse.text) ??
        readString(rawResponse.content) ??
        '';

    const reasoning =
        readString(message.reasoning) ??
        readString(message.reasoning_content) ??
        readString(delta.reasoning) ??
        readString(delta.reasoning_content) ??
        readGeminiThoughtText(responseContent) ??
        readThinkingContent(rawResponse.content) ??
        readString(rawResponse.reasoning) ??
        '';

    const reasoningSignature = readReasoningSignature(message, responseContent);
    const toolSignatures = readToolSignaturesFromReasoningDetails(message.reasoning_details);

    return completeSnapshot({
        text,
        alternatives: readChoiceAlternatives(choices),
        reasoning,
        reasoningSignature,
        images: [],
        toolCalls: [
            ...normalizeToolCalls(message.tool_calls, toolSignatures),
            ...normalizeToolCalls(directMessage.tool_calls, toolSignatures),
            ...normalizeClaudeToolUses(rawResponse.content, toolSignatures),
            ...normalizeGeminiFunctionCalls(responseContent, toolSignatures),
        ],
        toolSignatures,
        logprobs: firstChoice.logprobs ?? rawResponse.logprobs ?? null,
        finishReason: readFinishReason(firstChoice) ?? readFinishReason(rawResponse),
        source: 'non-stream',
        chunkCount: 1,
    });
}

function readCompletionText(value: Record<string, unknown>): string | null {
    const firstChoice = Array.isArray(value.choices) && isRecord(value.choices[0])
        ? value.choices[0]
        : {};
    const message = isRecord(firstChoice.message) ? firstChoice.message : {};
    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};

    return (
        readCompletionContent(message.content) ??
        readCompletionContent(delta.content) ??
        readString(firstChoice.text)
    );
}

function readCompletionContent(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (!Array.isArray(value)) {
        return null;
    }

    const text = value
        .map((part) => {
            if (!isRecord(part)) {
                return '';
            }

            return readString(part.text) ?? '';
        })
        .join('');

    return text || null;
}

function createEmptySnapshot(source: ReforgedChatRuntimeSource): ReforgedChatRuntimeSnapshot {
    return {
        text: '',
        alternatives: [],
        reasoning: '',
        reasoningSignature: null,
        images: [],
        toolCalls: [],
        toolSignatures: {},
        logprobs: null,
        finishReason: null,
        source,
        chunkCount: 0,
    };
}

function completeSnapshot(snapshot: ReforgedChatRuntimeSnapshot): ReforgedChatRuntimeResult {
    return {
        ...snapshot,
        completed: true,
    };
}

function readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    return value.filter((item): item is string => typeof item === 'string');
}

function readChoiceAlternatives(choices: Record<string, unknown>[]): string[] {
    return choices
        .slice(1)
        .map((choice) => {
            const message = isRecord(choice.message) ? choice.message : {};
            const delta = isRecord(choice.delta) ? choice.delta : {};

            return (
                readCompletionContent(message.content) ??
                readCompletionContent(delta.content) ??
                readString(choice.text) ??
                ''
            );
        })
        .filter((text) => text.length > 0);
}

function readGeminiThoughtText(responseContent: Record<string, unknown>): string | null {
    const parts = Array.isArray(responseContent.parts) ? responseContent.parts : [];
    const thoughtText = parts
        .filter((part): part is Record<string, unknown> => isRecord(part) && part.thought === true)
        .map((part) => readString(part.text) ?? '')
        .join('');

    return thoughtText || null;
}

function readThinkingContent(value: unknown): string | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const thinkingText = value
        .filter((part): part is Record<string, unknown> => isRecord(part) && (part.type === 'thinking' || part.thinking === true))
        .map((part) => readString(part.text) ?? readString(part.thinking) ?? '')
        .join('');

    return thinkingText || null;
}

function readReasoningSignature(
    message: Record<string, unknown>,
    responseContent: Record<string, unknown>,
): string | null {
    const openRouterSignature = readReasoningSignatureFromDetails(message.reasoning_details);
    if (openRouterSignature) {
        return openRouterSignature;
    }

    const parts = Array.isArray(responseContent.parts) ? responseContent.parts : [];
    for (const part of parts) {
        if (isRecord(part) && typeof part.thoughtSignature === 'string') {
            return part.thoughtSignature;
        }
    }

    return null;
}

function readReasoningSignatureFromDetails(value: unknown): string | null {
    if (!Array.isArray(value)) {
        return null;
    }

    for (const detail of value) {
        if (!isRecord(detail)) {
            continue;
        }

        const id = readString(detail.id);
        const data = readString(detail.data);
        const isToolLikeId = typeof id === 'string' && /^(tool_|call_)/.test(id);

        if (detail.type === 'reasoning.encrypted' && data && !isToolLikeId) {
            return data;
        }
    }

    return null;
}

function readToolSignaturesFromReasoningDetails(value: unknown): Record<string, string> {
    const signatures: Record<string, string> = {};

    if (!Array.isArray(value)) {
        return signatures;
    }

    for (const detail of value) {
        if (!isRecord(detail)) {
            continue;
        }

        const id = readString(detail.id);
        const data = readString(detail.data);

        if (detail.type === 'reasoning.encrypted' && id && data && /^(tool_|call_)/.test(id)) {
            signatures[id] = data;
        }
    }

    return signatures;
}

function readToolSignatures(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }

    const signatures: Record<string, string> = {};
    for (const [key, item] of Object.entries(value.toolSignatures ?? {})) {
        if (typeof item === 'string') {
            signatures[key] = item;
        }
    }

    return signatures;
}

function normalizeToolCalls(value: unknown, signatures: Record<string, string>): ReforgedChatRuntimeToolCall[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => normalizeToolCallItem(item, signatures));
}

function normalizeToolCallItem(value: unknown, signatures: Record<string, string>): ReforgedChatRuntimeToolCall[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => normalizeToolCallItem(item, signatures));
    }

    if (!isRecord(value)) {
        return [];
    }

    const fn = isRecord(value.function) ? value.function : {};
    const id = readString(value.id) ?? readString(value.tool_call_id);
    const argumentsText = readString(fn.arguments) ?? readString(value.arguments) ?? readString(value.input);
    const toolCall: ReforgedChatRuntimeToolCall = {
        id: id ?? undefined,
        type: readString(value.type) ?? undefined,
        name: readString(fn.name) ?? readString(value.name) ?? undefined,
        argumentsText: argumentsText ?? undefined,
        argumentsJson: parseJsonIfPossible(argumentsText),
        signature: id ? signatures[id] ?? null : null,
    };

    return [toolCall];
}

function normalizeClaudeToolUses(value: unknown, signatures: Record<string, string>): ReforgedChatRuntimeToolCall[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'tool_use')
        .map((part) => {
            const id = readString(part.id);
            const argumentsText = typeof part.input === 'string'
                ? part.input
                : isRecord(part.input) || Array.isArray(part.input)
                    ? JSON.stringify(part.input)
                    : undefined;

            return {
                id: id ?? undefined,
                type: 'tool_use',
                name: readString(part.name) ?? undefined,
                argumentsText,
                argumentsJson: parseJsonIfPossible(argumentsText),
                signature: id ? signatures[id] ?? null : null,
            };
        });
}

function normalizeGeminiFunctionCalls(
    responseContent: Record<string, unknown>,
    signatures: Record<string, string>,
): ReforgedChatRuntimeToolCall[] {
    const parts = Array.isArray(responseContent.parts) ? responseContent.parts : [];

    return parts.flatMap((part) => {
        if (!isRecord(part) || !isRecord(part.functionCall)) {
            return [];
        }

        const functionCall = part.functionCall;
        const id = readString(functionCall.id);
        const argumentsText = isRecord(functionCall.args) || Array.isArray(functionCall.args)
            ? JSON.stringify(functionCall.args)
            : readString(functionCall.args);

        return [{
            id: id ?? undefined,
            type: 'functionCall',
            name: readString(functionCall.name) ?? undefined,
            argumentsText: argumentsText ?? undefined,
            argumentsJson: parseJsonIfPossible(argumentsText),
            signature: id ? signatures[id] ?? null : null,
        }];
    });
}

function parseJsonIfPossible(value: string | null | undefined): unknown {
    if (!value) {
        return undefined;
    }

    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function readFinishReason(value: unknown): string | null {
    if (!isRecord(value)) {
        return null;
    }

    return readString(value.finish_reason) ?? readString(value.finishReason);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    return isRecord(value) && Symbol.asyncIterator in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
