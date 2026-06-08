// DRAFT: 待主干评审

type ExtensibleString<TValue extends string> = TValue | (string & Record<never, never>);

export type ReforgedGenerationApi = ExtensibleString<
  'openai' | 'kobold' | 'koboldhorde' | 'novel' | 'textgenerationwebui'
>;

export type ReforgedChatRole = ExtensibleString<'system' | 'user' | 'assistant' | 'tool'>;

export interface ReforgedMessageContentPart {
  type: string;
  text?: string;
  image_url?: unknown;
  [key: string]: unknown;
}

export interface ReforgedChatCompletionMessage {
  role: ReforgedChatRole;
  content: string | ReforgedMessageContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export type ReforgedGenerationPrompt = string | ReforgedChatCompletionMessage[];

export interface ReforgedJsonSchema {
  returnInvalid?: boolean;
  [key: string]: unknown;
}

export interface HeadlessGenerationRequest {
  prompt: ReforgedGenerationPrompt;
  api?: ReforgedGenerationApi | null;
  instructOverride?: boolean;
  quietToLoud?: boolean;
  systemPrompt?: string;
  responseLength?: number | null;
  trimNames?: boolean;
  prefill?: string;
  jsonSchema?: ReforgedJsonSchema | null;
}

export type HeadlessRawDataRequest = Omit<HeadlessGenerationRequest, 'trimNames'>;

export interface HeadlessChatCompletionRequest {
  messages: ReforgedChatCompletionMessage[];
  type?: ExtensibleString<'quiet' | 'normal' | 'continue' | 'impersonate'>;
  signal?: AbortSignal;
  jsonSchema?: ReforgedJsonSchema | null;
}

export type EngineCapabilityId = 'generateRaw' | 'generateRawData' | 'sendOpenAIRequest';

export interface EngineAdapterCapability {
  id: EngineCapabilityId;
  moduleId: '@sillytavern/script' | '@sillytavern/scripts/openai';
  exportName: string;
  available: boolean;
  detail?: string;
}

export interface EngineAdapterDiagnostics {
  ok: boolean;
  checkedAt: string;
  capabilities: EngineAdapterCapability[];
  warnings: string[];
  blockers: string[];
}

export interface HeadlessEngineAdapter {
  inspect(): Promise<EngineAdapterDiagnostics>;
  generateText(request: HeadlessGenerationRequest): Promise<string>;
  generateRawData(request: HeadlessRawDataRequest): Promise<unknown>;
  sendChatCompletion(request: HeadlessChatCompletionRequest): Promise<unknown>;
}
