import { describe, expect, it, vi } from 'vitest';
import { BrowserDirectChatCompletionError } from './browserDirectChatCompletionAdapter';
import { EngineAdapterUnavailableError, createHeadlessEngineAdapter } from './headlessEngineAdapter';

describe('createHeadlessEngineAdapter', () => {
  it('inspects headless SillyTavern exports without invoking DOM-heavy Generate()', async () => {
    const Generate = vi.fn();
    const getContext = vi.fn();
    const adapter = createHeadlessEngineAdapter({
      now: () => new Date('2026-06-09T00:00:00.000Z'),
      getRuntimeGlobal: () => ({
        document: {},
        $: vi.fn(),
        toastr: {},
        AbortController,
        ReadableStream,
        location: { href: 'http://localhost:5173/#/' },
        navigator: { userAgent: 'vitest' },
      }),
      loadScriptModule: async () => ({
        generateRaw: vi.fn(),
        generateRawData: vi.fn(),
        Generate,
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: vi.fn(),
          removeListener: vi.fn(),
        },
        getContext,
      }),
      loadOpenAIModule: async () => ({
        sendOpenAIRequest: vi.fn(),
      }),
    });

    const diagnostics = await adapter.inspect();

    expect(diagnostics).toMatchObject({
      ok: true,
      checkedAt: '2026-06-09T00:00:00.000Z',
      blockers: [],
      environment: {
        hasDocument: true,
        hasJQuery: true,
        hasToastr: true,
        hasAbortController: true,
        hasReadableStream: true,
        locationHref: 'http://localhost:5173/#/',
        userAgent: 'vitest',
      },
    });
    expect(diagnostics.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'generateRaw', available: true }),
        expect.objectContaining({ id: 'generateRawData', available: true }),
        expect.objectContaining({ id: 'sendOpenAIRequest', available: true }),
      ]),
    );
    expect(diagnostics.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'scriptModuleImport', status: 'pass' }),
        expect.objectContaining({ id: 'openAIModuleImport', status: 'pass' }),
        expect.objectContaining({ id: 'eventSourceShape', status: 'pass' }),
        expect.objectContaining({ id: 'getContextExport', status: 'pass' }),
        expect.objectContaining({ id: 'getContextCall', status: 'skipped' }),
        expect.objectContaining({ id: 'streamingPrimitives', status: 'pass' }),
        expect.objectContaining({ id: 'domHeavyGenerateExport', status: 'warn' }),
      ]),
    );
    expect(diagnostics.warnings).toContain(
      'DOM-heavy Generate() is present but intentionally excluded from the adapter.',
    );
    expect(Generate).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('reports runtime probe failures when context probing is explicitly requested', async () => {
    const getContext = vi.fn(() => {
      throw new Error('Legacy context boot failed');
    });
    const adapter = createHeadlessEngineAdapter({
      getRuntimeGlobal: () => ({
        AbortController,
        ReadableStream,
      }),
      loadScriptModule: async () => ({
        generateRaw: vi.fn(),
        generateRawData: vi.fn(),
        eventSource: {
          on: vi.fn(),
          once: vi.fn(),
          emit: vi.fn(),
          removeListener: vi.fn(),
        },
        getContext,
      }),
      loadOpenAIModule: async () => ({
        sendOpenAIRequest: vi.fn(),
      }),
    });

    const diagnostics = await adapter.inspect({ probeContext: true });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'getContextCall',
          status: 'fail',
          error: 'Legacy context boot failed',
        }),
      ]),
    );
    expect(getContext).toHaveBeenCalledOnce();
  });

  it('reports event and streaming primitive gaps in diagnostics', async () => {
    const adapter = createHeadlessEngineAdapter({
      getRuntimeGlobal: () => ({}),
      loadScriptModule: async () => ({
        generateRaw: vi.fn(),
        generateRawData: vi.fn(),
        eventSource: {
          emit: vi.fn(),
        },
        getContext: vi.fn(),
      }),
      loadOpenAIModule: async () => ({
        sendOpenAIRequest: vi.fn(),
      }),
    });

    const diagnostics = await adapter.inspect();

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'eventSourceShape',
          status: 'warn',
          detail: 'eventSource is missing expected method(s): on, once, removeListener.',
        }),
        expect.objectContaining({
          id: 'streamingPrimitives',
          status: 'fail',
          detail: 'Missing browser streaming primitive(s): AbortController, ReadableStream.',
        }),
      ]),
    );
  });

  it('delegates text generation to generateRaw()', async () => {
    const generateRaw = vi.fn().mockResolvedValue('hello from the engine');
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({ generateRaw }),
      loadOpenAIModule: async () => ({}),
    });

    await expect(
      adapter.generateText({
        prompt: 'Say hello',
        api: 'openai',
        responseLength: 64,
        trimNames: false,
      }),
    ).resolves.toBe('hello from the engine');

    expect(generateRaw).toHaveBeenCalledWith({
      prompt: 'Say hello',
      api: 'openai',
      responseLength: 64,
      trimNames: false,
    });
  });

  it('delegates raw data generation to generateRawData()', async () => {
    const rawData = { choices: [{ message: { content: 'raw' } }] };
    const generateRawData = vi.fn().mockResolvedValue(rawData);
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({ generateRawData }),
      loadOpenAIModule: async () => ({}),
    });

    await expect(
      adapter.generateRawData({
        prompt: [{ role: 'user', content: 'Return raw data' }],
        api: 'openai',
      }),
    ).resolves.toBe(rawData);

    expect(generateRawData).toHaveBeenCalledWith({
      prompt: [{ role: 'user', content: 'Return raw data' }],
      api: 'openai',
    });
  });

  it('delegates OpenAI-compatible chat completion to sendOpenAIRequest()', async () => {
    const sendOpenAIRequest = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({ sendOpenAIRequest }),
    });
    const abortController = new AbortController();

    await expect(
      adapter.sendChatCompletion({
        type: 'quiet',
        messages: [{ role: 'user', content: 'Ping' }],
        signal: abortController.signal,
        jsonSchema: { returnInvalid: true },
      }),
    ).resolves.toEqual({ ok: true });

    expect(sendOpenAIRequest).toHaveBeenCalledWith(
      'quiet',
      [{ role: 'user', content: 'Ping' }],
      abortController.signal,
      { jsonSchema: { returnInvalid: true } },
    );
  });

  it('uses the Reforged backend first for auto runtime transport', async () => {
    const browserFetch = vi.fn<typeof fetch>();
    const legacyFetch = vi.fn<typeof fetch>();
    const reforgedFetch = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('http://127.0.0.1:8787/api/reforged/chat/completions');
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-memory-only-secret',
        },
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        stream: false,
      });
      expect(JSON.stringify(body)).not.toContain('sk-memory-only-secret');

      return new Response(JSON.stringify({ choices: [{ message: { content: 'reforged' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      reforgedBackendChatCompletion: { fetch: reforgedFetch },
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false,
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'auto',
      },
    })).resolves.toEqual({ choices: [{ message: { content: 'reforged' } }] });

    expect(reforgedFetch).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('uses the Reforged backend without touching browser direct or legacy proxy when selected', async () => {
    const browserFetch = vi.fn<typeof fetch>();
    const legacyFetch = vi.fn<typeof fetch>();
    const reforgedFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'reforged selected' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      reforgedBackendChatCompletion: { fetch: reforgedFetch },
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false,
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'reforged-backend',
      },
    })).resolves.toEqual({ choices: [{ message: { content: 'reforged selected' } }] });

    expect(reforgedFetch).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('falls back from auto Reforged backend through browser direct to the legacy proxy only for network-style failures', async () => {
    const sendOpenAIRequest = vi.fn().mockResolvedValue({ ok: false });
    const browserFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const legacyFetch = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/csrf-token') {
        return new Response(JSON.stringify({ token: 'csrf-token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      expect(input).toBe('/api/backends/chat-completions/generate');
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token-1',
        },
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chat_completion_source: 'openai',
        reverse_proxy: 'https://api.example.test/v1',
        proxy_password: 'sk-memory-only-secret',
        model: 'example-chat-model',
        stream: false,
      });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'direct' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({ sendOpenAIRequest }),
      reforgedBackendChatCompletion: {
        fetch: vi.fn<typeof fetch>(async () => {
          throw new TypeError('Reforged backend is offline');
        }),
      },
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });
    const testWindow = new EventTarget();
    vi.stubGlobal('window', testWindow);
    vi.stubGlobal('CustomEvent', class TestCustomEvent<T = unknown> extends Event {
      readonly detail: T;

      constructor(type: string, eventInitDict?: CustomEventInit<T>) {
        super(type, eventInitDict);
        this.detail = eventInitDict?.detail as T;
      }
    });
    const fallbackEvents: unknown[] = [];
    const listener = (event: Event) => fallbackEvents.push(event);
    window.addEventListener('reforged-transport-fallback', listener);

    try {
      await expect(adapter.sendChatCompletion({
        messages: [{ role: 'user', content: 'Ping' }],
        stream: false,
        runtimeConnection: {
          provider: 'openai-compatible',
          baseUrl: 'https://api.example.test/v1',
          model: 'example-chat-model',
          apiKey: 'sk-memory-only-secret',
          transport: 'auto',
        },
      })).resolves.toEqual({ choices: [{ message: { content: 'direct' } }] });
    } finally {
      window.removeEventListener('reforged-transport-fallback', listener);
      vi.unstubAllGlobals();
    }

    expect(adapter.supportsDirectBackendChatCompletion).toBe(true);
    expect(browserFetch).toHaveBeenCalledOnce();
    expect(legacyFetch).toHaveBeenCalledTimes(2);
    expect(sendOpenAIRequest).not.toHaveBeenCalled();
    expect(fallbackEvents).toHaveLength(2);
    expect(fallbackEvents[0]).toMatchObject({
      detail: {
        reason: expect.stringContaining('Reforged backend unavailable'),
      },
    });
    expect(fallbackEvents[1]).toMatchObject({
      detail: {
        reason: expect.stringContaining('Failed to fetch'),
      },
    });
  });

  it('does not fall back from auto when the Reforged backend returns credential/provider HTTP errors', async () => {
    const reforgedFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: 'Provider returned HTTP 401.',
    }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    }));
    const browserFetch = vi.fn<typeof fetch>();
    const legacyFetch = vi.fn<typeof fetch>();
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      reforgedBackendChatCompletion: { fetch: reforgedFetch },
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false,
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'auto',
      },
    })).rejects.toMatchObject({
      name: 'ReforgedBackendChatCompletionError',
      status: 401,
    });
    expect(reforgedFetch).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('does not fall back from explicit browser direct when the upstream returned HTTP errors', async () => {
    const browserFetch = vi.fn<typeof fetch>(async () => new Response('Unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    }));
    const legacyFetch = vi.fn<typeof fetch>();
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false,
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'browser-direct',
      },
    })).rejects.toMatchObject({
      name: 'BrowserDirectChatCompletionError',
      kind: 'http',
      status: 401,
    });
    expect(browserFetch).toHaveBeenCalledOnce();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('does not fall back when browser-direct transport fails', async () => {
    const browserFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const legacyFetch = vi.fn<typeof fetch>();
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'browser-direct',
      },
    })).rejects.toMatchObject({
      name: 'BrowserDirectChatCompletionError',
      kind: 'cors-or-network',
    });
    expect(browserFetch).toHaveBeenCalledOnce();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('uses the legacy proxy without touching browser direct when legacy-proxy transport is selected', async () => {
    const browserFetch = vi.fn<typeof fetch>(async () => {
      throw new BrowserDirectChatCompletionError('cors-or-network', 'should not run');
    });
    const legacyFetch = vi.fn<typeof fetch>(async (input) => {
      if (input === '/csrf-token') {
        return new Response(JSON.stringify({ token: 'csrf-token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ choices: [{ message: { content: 'legacy' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
      browserDirectChatCompletion: { fetch: browserFetch },
      directBackendChatCompletion: { fetch: legacyFetch },
    });

    await expect(adapter.sendChatCompletion({
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false,
      runtimeConnection: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1',
        model: 'example-chat-model',
        apiKey: 'sk-memory-only-secret',
        transport: 'legacy-proxy',
      },
    })).resolves.toEqual({ choices: [{ message: { content: 'legacy' } }] });
    expect(browserFetch).not.toHaveBeenCalled();
    expect(legacyFetch).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error when a required headless export is missing', async () => {
    const adapter = createHeadlessEngineAdapter({
      loadScriptModule: async () => ({}),
      loadOpenAIModule: async () => ({}),
    });

    await expect(adapter.generateText({ prompt: 'Hello' })).rejects.toBeInstanceOf(
      EngineAdapterUnavailableError,
    );
    await expect(adapter.generateText({ prompt: 'Hello' })).rejects.toMatchObject({
      capability: 'generateRaw',
    });
  });
});
