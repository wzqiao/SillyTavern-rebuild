import type {
  EngineAdapterCapability,
  EngineAdapterDiagnostics,
  EngineAdapterEnvironment,
  EngineAdapterInspectOptions,
  EngineRuntimeProbe,
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
  getRuntimeGlobal?: () => EngineAdapterRuntimeGlobal;
  now?: () => Date;
}

interface EngineAdapterRuntimeGlobal {
  document?: unknown;
  location?: { href?: string };
  navigator?: { userAgent?: string };
  AbortController?: unknown;
  ReadableStream?: unknown;
  toastr?: unknown;
  $?: unknown;
  jQuery?: unknown;
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
  const getRuntimeGlobal = dependencies.getRuntimeGlobal ?? defaultGetRuntimeGlobal;
  const now = dependencies.now ?? (() => new Date());

  return {
    async inspect(options: EngineAdapterInspectOptions = {}): Promise<EngineAdapterDiagnostics> {
      const warnings: string[] = [];
      const blockers: string[] = [];
      const capabilities: EngineAdapterCapability[] = [];
      const probes: EngineRuntimeProbe[] = [];
      const environment = inspectEnvironment(getRuntimeGlobal());

      let scriptModule: SillyTavernScriptModule | null = null;
      let openAIModule: SillyTavernOpenAIModule | null = null;

      try {
        scriptModule = await loadScriptModule();
        probes.push({
          id: 'scriptModuleImport',
          status: 'pass',
          detail: `${SCRIPT_MODULE_ID} imported successfully.`,
        });
      } catch (error) {
        const message = formatLoadFailure(SCRIPT_MODULE_ID, error);
        blockers.push(message);
        probes.push({
          id: 'scriptModuleImport',
          status: 'fail',
          detail: `Could not import ${SCRIPT_MODULE_ID}.`,
          error: describeError(error),
        });
      }

      try {
        openAIModule = await loadOpenAIModule();
        probes.push({
          id: 'openAIModuleImport',
          status: 'pass',
          detail: `${OPENAI_MODULE_ID} imported successfully.`,
        });
      } catch (error) {
        const message = formatLoadFailure(OPENAI_MODULE_ID, error);
        blockers.push(message);
        probes.push({
          id: 'openAIModuleImport',
          status: 'fail',
          detail: `Could not import ${OPENAI_MODULE_ID}.`,
          error: describeError(error),
        });
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
        const detail = 'DOM-heavy Generate() is present but intentionally excluded from the adapter.';
        warnings.push(detail);
        probes.push({
          id: 'domHeavyGenerateExport',
          status: 'warn',
          detail,
        });
      } else {
        probes.push({
          id: 'domHeavyGenerateExport',
          status: scriptModule ? 'pass' : 'skipped',
          detail: scriptModule
            ? 'DOM-heavy Generate() export was not detected.'
            : 'Skipped because the script module did not import.',
        });
      }

      if (scriptModule && typeof scriptModule.getContext !== 'function') {
        const detail = 'getContext() is not exported; future context diagnostics may need another seam.';
        warnings.push(detail);
        probes.push({
          id: 'getContextExport',
          status: 'warn',
          detail,
        });
      } else {
        probes.push({
          id: 'getContextExport',
          status: scriptModule ? 'pass' : 'skipped',
          detail: scriptModule
            ? 'getContext() export is available.'
            : 'Skipped because the script module did not import.',
        });
      }

      const eventSourceProbe = inspectEventSource(scriptModule);
      probes.push(eventSourceProbe);
      if (eventSourceProbe.status === 'warn') {
        warnings.push(eventSourceProbe.detail);
      }

      probes.push(inspectStreamingPrimitives(environment));
      probes.push(await inspectContextCall(scriptModule, options.probeContext ?? false));

      return {
        ok:
          capabilities.every((item) => item.available) &&
          blockers.length === 0 &&
          probes.every((probe) => probe.status !== 'fail'),
        checkedAt: now().toISOString(),
        environment,
        capabilities,
        probes,
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

function defaultGetRuntimeGlobal(): EngineAdapterRuntimeGlobal {
  return globalThis as EngineAdapterRuntimeGlobal;
}

function inspectEnvironment(runtimeGlobal: EngineAdapterRuntimeGlobal): EngineAdapterEnvironment {
  return {
    hasDocument: typeof runtimeGlobal.document !== 'undefined',
    hasJQuery: typeof runtimeGlobal.$ !== 'undefined' || typeof runtimeGlobal.jQuery !== 'undefined',
    hasToastr: typeof runtimeGlobal.toastr !== 'undefined',
    hasAbortController: typeof runtimeGlobal.AbortController === 'function',
    hasReadableStream: typeof runtimeGlobal.ReadableStream === 'function',
    locationHref: runtimeGlobal.location?.href,
    userAgent: runtimeGlobal.navigator?.userAgent,
  };
}

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

function inspectEventSource(scriptModule: SillyTavernScriptModule | null): EngineRuntimeProbe {
  if (!scriptModule) {
    return {
      id: 'eventSourceShape',
      status: 'skipped',
      detail: 'Skipped because the script module did not import.',
    };
  }

  const eventSource = scriptModule.eventSource;

  if (!isRecord(eventSource)) {
    return {
      id: 'eventSourceShape',
      status: 'warn',
      detail: 'eventSource is not exported as an inspectable object; generation events may need another seam.',
    };
  }

  const requiredMethods = ['on', 'once', 'emit', 'removeListener'];
  const missingMethods = requiredMethods.filter((method) => typeof eventSource[method] !== 'function');

  if (missingMethods.length > 0) {
    return {
      id: 'eventSourceShape',
      status: 'warn',
      detail: `eventSource is missing expected method(s): ${missingMethods.join(', ')}.`,
    };
  }

  return {
    id: 'eventSourceShape',
    status: 'pass',
    detail: 'eventSource exposes the expected event-emitter methods.',
  };
}

async function inspectContextCall(
  scriptModule: SillyTavernScriptModule | null,
  shouldProbeContext: boolean,
): Promise<EngineRuntimeProbe> {
  if (!scriptModule) {
    return {
      id: 'getContextCall',
      status: 'skipped',
      detail: 'Skipped because the script module did not import.',
    };
  }

  if (typeof scriptModule.getContext !== 'function') {
    return {
      id: 'getContextCall',
      status: 'skipped',
      detail: 'Skipped because getContext() is not exported.',
    };
  }

  if (!shouldProbeContext) {
    return {
      id: 'getContextCall',
      status: 'skipped',
      detail: 'Skipped by default to avoid invoking legacy runtime state during lightweight inspection.',
    };
  }

  try {
    const context = scriptModule.getContext();
    return {
      id: 'getContextCall',
      status: isRecord(context) ? 'pass' : 'warn',
      detail: isRecord(context)
        ? 'getContext() returned an object.'
        : `getContext() returned ${typeof context}; expected an object-like context.`,
    };
  } catch (error) {
    return {
      id: 'getContextCall',
      status: 'fail',
      detail: 'getContext() threw during runtime probing.',
      error: describeError(error),
    };
  }
}

function inspectStreamingPrimitives(environment: EngineAdapterEnvironment): EngineRuntimeProbe {
  if (!environment.hasAbortController || !environment.hasReadableStream) {
    const missing = [
      !environment.hasAbortController ? 'AbortController' : '',
      !environment.hasReadableStream ? 'ReadableStream' : '',
    ].filter(Boolean);

    return {
      id: 'streamingPrimitives',
      status: 'fail',
      detail: `Missing browser streaming primitive(s): ${missing.join(', ')}.`,
    };
  }

  return {
    id: 'streamingPrimitives',
    status: 'pass',
    detail: 'AbortController and ReadableStream are available for streaming requests.',
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
  const reason = describeError(error);
  return `Unable to load ${moduleId}: ${reason}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
