import type { HeadlessEngineAdapter } from '@/contracts/engine';
import { getLegacyRuntimeGlobal, loadLegacyRuntimeModules } from './legacyRuntimeHost';

export async function loadHeadlessEngineAdapter(): Promise<HeadlessEngineAdapter> {
  const { createHeadlessEngineAdapter } = await import('./headlessEngineAdapter');
  return createHeadlessEngineAdapter({
    loadScriptModule: async () => (await loadLegacyRuntimeModules()).scriptModule,
    loadOpenAIModule: async () => (await loadLegacyRuntimeModules()).openAIModule,
    getRuntimeGlobal: () => getLegacyRuntimeGlobal() ?? globalThis,
  });
}
