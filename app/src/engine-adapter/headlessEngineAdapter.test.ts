import { describe, expect, it, vi } from 'vitest';
import { EngineAdapterUnavailableError, createHeadlessEngineAdapter } from './headlessEngineAdapter';

describe('createHeadlessEngineAdapter', () => {
  it('inspects headless SillyTavern exports without invoking DOM-heavy Generate()', async () => {
    const Generate = vi.fn();
    const adapter = createHeadlessEngineAdapter({
      now: () => new Date('2026-06-09T00:00:00.000Z'),
      loadScriptModule: async () => ({
        generateRaw: vi.fn(),
        generateRawData: vi.fn(),
        Generate,
        eventSource: {},
        getContext: vi.fn(),
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
    });
    expect(diagnostics.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'generateRaw', available: true }),
        expect.objectContaining({ id: 'generateRawData', available: true }),
        expect.objectContaining({ id: 'sendOpenAIRequest', available: true }),
      ]),
    );
    expect(diagnostics.warnings).toContain(
      'DOM-heavy Generate() is present but intentionally excluded from the adapter.',
    );
    expect(Generate).not.toHaveBeenCalled();
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
