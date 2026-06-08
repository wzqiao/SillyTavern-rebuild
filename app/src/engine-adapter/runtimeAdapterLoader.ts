import type { HeadlessEngineAdapter } from '@/contracts/engine';

export async function loadHeadlessEngineAdapter(): Promise<HeadlessEngineAdapter> {
  const { createHeadlessEngineAdapter } = await import('./headlessEngineAdapter');
  return createHeadlessEngineAdapter();
}
