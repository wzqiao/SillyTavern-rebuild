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
  responseLength?: number | null;
  stream?: boolean;
  runtimeConnection?: HeadlessChatCompletionRuntimeConnection | null;
}

export interface HeadlessChatCompletionRuntimeConnection {
  provider: ExtensibleString<'openai-compatible'>;
  baseUrl: string;
  model: string;
  apiKey: string;
  api?: ReforgedGenerationApi;
}

export type EngineCapabilityId = 'generateRaw' | 'generateRawData' | 'sendOpenAIRequest';

export type EngineRuntimeProbeId =
  | 'scriptModuleImport'
  | 'openAIModuleImport'
  | 'eventSourceShape'
  | 'getContextExport'
  | 'getContextCall'
  | 'domHeavyGenerateExport'
  | 'streamingPrimitives';

export type EngineRuntimeProbeStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface EngineAdapterCapability {
  id: EngineCapabilityId;
  moduleId: '@sillytavern/script' | '@sillytavern/scripts/openai';
  exportName: string;
  available: boolean;
  detail?: string;
}

export interface EngineAdapterEnvironment {
  hasDocument: boolean;
  hasJQuery: boolean;
  hasToastr: boolean;
  hasAbortController: boolean;
  hasReadableStream: boolean;
  locationHref?: string;
  userAgent?: string;
}

export interface EngineRuntimeProbe {
  id: EngineRuntimeProbeId;
  status: EngineRuntimeProbeStatus;
  detail: string;
  error?: string;
}

export interface EngineAdapterInspectOptions {
  probeContext?: boolean;
}

export interface EngineAdapterDiagnostics {
  ok: boolean;
  checkedAt: string;
  environment: EngineAdapterEnvironment;
  capabilities: EngineAdapterCapability[];
  probes: EngineRuntimeProbe[];
  warnings: string[];
  blockers: string[];
}

export interface HeadlessEngineAdapter {
  supportsDirectBackendChatCompletion?: boolean;
  inspect(options?: EngineAdapterInspectOptions): Promise<EngineAdapterDiagnostics>;
  generateText(request: HeadlessGenerationRequest): Promise<string>;
  generateRawData(request: HeadlessRawDataRequest): Promise<unknown>;
  sendChatCompletion(request: HeadlessChatCompletionRequest): Promise<unknown>;
}
