import { computed, ref } from 'vue';
import { en } from './en';
import { zh } from './zh';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'st-reforged-locale';

function readInitial(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

const locale = ref<Locale>(readInitial());
const dicts = { zh, en } as const;
const messages = computed(() => dicts[locale.value]);

export function setLocale(next: Locale): void {
  locale.value = next;

  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Locale persistence is a convenience; the in-memory switch still works.
  }
}

export function useI18n() {
  return {
    t: messages,
    locale,
    setLocale,
  };
}
