import type {
  EngineAdapterCapability,
  EngineAdapterDiagnostics,
  EngineCapabilityId,
  HeadlessChatCompletionRequest,
  HeadlessEngineAdapter,
  HeadlessGenerationRequest,
  HeadlessRawDataRequest,
} from '@/contracts/engine';

interface SillyTavernScriptModule {
  generateRaw?: (params: HeadlessGenerationRequest) => Promise<string>;
  generateRawData?: (params: HeadlessRawDataRequest) => Promise<unknown>;
  Generate?: (...args: unknown[]) => Promise<unknown>;
  eventSource?: unknown;
  getContext?: () => unknown;
}

interface SillyTavernOpenAIModule {
  sendOpenAIRequest?: (
    type: NonNullable<HeadlessChatCompletionRequest['type']>,
    messages: HeadlessChatCompletionRequest['messages'],
    signal: AbortSignal,
    options?: Pick<HeadlessChatCompletionRequest, 'jsonSchema'>,
  ) => Promise<unknown>;
}

export interface HeadlessEngineAdapterDependencies {
  loadScriptModule?: () => Promise<SillyTavernScriptModule>;
  loadOpenAIModule?: () => Promise<SillyTavernOpenAIModule>;
  now?: () => Date;
}

export class EngineAdapterUnavailableError extends Error {
  constructor(
    public readonly capability: EngineCapabilityId,
    message: string,
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = 'EngineAdapterUnavailableError';
  }
}

const SCRIPT_MODULE_ID = '@sillytavern/script' as const;
const OPENAI_MODULE_ID = '@sillytavern/scripts/openai' as const;

const defaultLoadScriptModule = async (): Promise<SillyTavernScriptModule> => {
  return import('@sillytavern/script');
};

const defaultLoadOpenAIModule = async (): Promise<SillyTavernOpenAIModule> => {
  return import('@sillytavern/scripts/openai');
};

export function createHeadlessEngineAdapter(
  dependencies: HeadlessEngineAdapterDependencies = {},
): HeadlessEngineAdapter {
  const loadScriptModule = dependencies.loadScriptModule ?? defaultLoadScriptModule;
  const loadOpenAIModule = dependencies.loadOpenAIModule ?? defaultLoadOpenAIModule;
  const now = dependencies.now ?? (() => new Date());

  return {
    async inspect(): Promise<EngineAdapterDiagnostics> {
      const warnings: string[] = [];
      const blockers: string[] = [];
      const capabilities: EngineAdapterCapability[] = [];

      let scriptModule: SillyTavernScriptModule | null = null;
      let openAIModule: SillyTavernOpenAIModule | null = null;

      try {
        scriptModule = await loadScriptModule();
      } catch (error) {
        blockers.push(formatLoadFailure(SCRIPT_MODULE_ID, error));
      }

      try {
        openAIModule = await loadOpenAIModule();
      } catch (error) {
        blockers.push(formatLoadFailure(OPENAI_MODULE_ID, error));
      }

      capabilities.push(
        capability('generateRaw', SCRIPT_MODULE_ID, 'generateRaw', scriptModule?.generateRaw),
        capability('generateRawData', SCRIPT_MODULE_ID, 'generateRawData', scriptModule?.generateRawData),
        capability(
          'sendOpenAIRequest',
          OPENAI_MODULE_ID,
          'sendOpenAIRequest',
          openAIModule?.sendOpenAIRequest,
        ),
      );

      if (typeof scriptModule?.Generate === 'function') {
        warnings.push('DOM-heavy Generate() is present but intentionally excluded from the adapter.');
      }

      if (scriptModule && typeof scriptModule.getContext !== 'function') {
        warnings.push('getContext() is not exported; future context diagnostics may need another seam.');
      }

      if (scriptModule && !('eventSource' in scriptModule)) {
        warnings.push('eventSource is not exported; generation event bridging cannot be inspected yet.');
      }

      return {
        ok: capabilities.every((item) => item.available) && blockers.length === 0,
        checkedAt: now().toISOString(),
        capabilities,
        warnings,
        blockers,
      };
    },

    async generateText(request: HeadlessGenerationRequest): Promise<string> {
      const generateRaw = await loadScriptFunction('generateRaw', loadScriptModule);
      return generateRaw(normalizeGenerationRequest(request));
    },

    async generateRawData(request: HeadlessRawDataRequest): Promise<unknown> {
      const generateRawData = await loadScriptFunction('generateRawData', loadScriptModule);
      return generateRawData(normalizeRawDataRequest(request));
    },

    async sendChatCompletion(request: HeadlessChatCompletionRequest): Promise<unknown> {
      const sendOpenAIRequest = await loadOpenAIFunction(loadOpenAIModule);
      const signal = request.signal ?? new AbortController().signal;
      return sendOpenAIRequest(request.type ?? 'quiet', request.messages, signal, {
        jsonSchema: request.jsonSchema ?? null,
      });
    },
  };
}

export const headlessEngineAdapter = createHeadlessEngineAdapter();

function capability(
  id: EngineCapabilityId,
  moduleId: EngineAdapterCapability['moduleId'],
  exportName: string,
  value: unknown,
): EngineAdapterCapability {
  const available = typeof value === 'function';
  return {
    id,
    moduleId,
    exportName,
    available,
    detail: available ? 'Headless export detected.' : 'Missing or non-function export.',
  };
}

async function loadScriptFunction<TCapability extends 'generateRaw' | 'generateRawData'>(
  capabilityId: TCapability,
  loadScriptModule: () => Promise<SillyTavernScriptModule>,
): Promise<NonNullable<SillyTavernScriptModule[TCapability]>> {
  try {
    const scriptModule = await loadScriptModule();
    const fn = scriptModule[capabilityId];

    if (typeof fn !== 'function') {
      throw new EngineAdapterUnavailableError(
        capabilityId,
        `${SCRIPT_MODULE_ID} does not export a callable ${capabilityId}().`,
      );
    }

    return fn;
  } catch (error) {
    if (error instanceof EngineAdapterUnavailableError) {
      throw error;
    }

    throw new EngineAdapterUnavailableError(
      capabilityId,
      `Failed to load ${SCRIPT_MODULE_ID} for ${capabilityId}().`,
      error,
    );
  }
}

async function loadOpenAIFunction(
  loadOpenAIModule: () => Promise<SillyTavernOpenAIModule>,
): Promise<NonNullable<SillyTavernOpenAIModule['sendOpenAIRequest']>> {
  try {
    const openAIModule = await loadOpenAIModule();
    const fn = openAIModule.sendOpenAIRequest;

    if (typeof fn !== 'function') {
      throw new EngineAdapterUnavailableError(
        'sendOpenAIRequest',
        `${OPENAI_MODULE_ID} does not export a callable sendOpenAIRequest().`,
      );
    }

    return fn;
  } catch (error) {
    if (error instanceof EngineAdapterUnavailableError) {
      throw error;
    }

    throw new EngineAdapterUnavailableError(
      'sendOpenAIRequest',
      `Failed to load ${OPENAI_MODULE_ID} for sendOpenAIRequest().`,
      error,
    );
  }
}

function normalizeGenerationRequest(request: HeadlessGenerationRequest): HeadlessGenerationRequest {
  assertPrompt(request.prompt);
  return { ...request };
}

function normalizeRawDataRequest(request: HeadlessRawDataRequest): HeadlessRawDataRequest {
  assertPrompt(request.prompt);
  return { ...request };
}

function assertPrompt(prompt: HeadlessGenerationRequest['prompt']): void {
  const isValidPrompt = typeof prompt === 'string' || Array.isArray(prompt);

  if (!isValidPrompt) {
    throw new TypeError('Headless engine prompt must be a string or chat-completion message array.');
  }
}

function formatLoadFailure(moduleId: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Unable to load ${moduleId}: ${reason}`;
}
