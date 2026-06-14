import type { SillyTavernOpenAIModule, SillyTavernScriptModule } from './headlessEngineAdapter';

export interface LegacyRuntimeModules {
  scriptModule: SillyTavernScriptModule;
  openAIModule: SillyTavernOpenAIModule;
  runtimeGlobal: Window;
}

interface LegacyRuntimeWindow extends Window {
  __ST_REFORGED_RUNTIME_MODULES__?: LegacyRuntimeModules;
  __ST_REFORGED_RUNTIME_MODULES_ERROR__?: string;
  SillyTavern?: {
    getContext?: () => unknown;
  };
}

export interface LegacyRuntimeHostOptions {
  runtimePath?: string;
  timeoutMs?: number;
}

const DEFAULT_RUNTIME_PATH = '/__st_runtime/';
const DEFAULT_TIMEOUT_MS = 120_000;

let runtimeFrame: HTMLIFrameElement | null = null;
let runtimeModulesPromise: Promise<LegacyRuntimeModules> | null = null;

export function getLegacyRuntimeGlobal(): Window | null {
  return runtimeFrame?.contentWindow ?? null;
}

export function loadLegacyRuntimeModules(
  options: LegacyRuntimeHostOptions = {},
): Promise<LegacyRuntimeModules> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('A browser document is required to load the SillyTavern runtime host.'));
  }

  if (!runtimeModulesPromise) {
    runtimeModulesPromise = createLegacyRuntimeHost(options).catch((error: unknown) => {
      resetLegacyRuntimeHost();
      runtimeModulesPromise = null;
      throw error;
    });
  }

  return runtimeModulesPromise;
}

export function resetLegacyRuntimeHost(): void {
  runtimeFrame?.remove();
  runtimeFrame = null;
  runtimeModulesPromise = null;
}

async function createLegacyRuntimeHost(options: LegacyRuntimeHostOptions): Promise<LegacyRuntimeModules> {
  const frame = ensureRuntimeFrame(options.runtimePath ?? DEFAULT_RUNTIME_PATH);
  await waitForRuntimeReady(frame, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return injectRuntimeModuleBridge(frame, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

function ensureRuntimeFrame(runtimePath: string): HTMLIFrameElement {
  if (runtimeFrame?.isConnected) {
    return runtimeFrame;
  }

  const frame = document.createElement('iframe');
  frame.title = 'SillyTavern runtime compatibility host';
  frame.dataset.testid = 'sillytavern-runtime-host';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.position = 'fixed';
  frame.style.inset = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.style.border = '0';
  frame.src = runtimePath;

  document.body.appendChild(frame);
  runtimeFrame = frame;
  return frame;
}

function waitForRuntimeReady(frame: HTMLIFrameElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let sawRuntimeDocument = false;
    const isReady = () => {
      try {
        const runtimeWindow = frame.contentWindow as LegacyRuntimeWindow | null;
        const runtimeDocument = frame.contentDocument;
        const hasRuntimeDocument = Boolean(runtimeDocument?.body && runtimeDocument.location.href !== 'about:blank');
        sawRuntimeDocument ||= hasRuntimeDocument;
        return Boolean(
          hasRuntimeDocument &&
          (runtimeDocument?.readyState === 'complete' || typeof runtimeWindow?.SillyTavern?.getContext === 'function')
        );
      } catch {
        return false;
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      frame.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      if (!isReady()) {
        return;
      }

      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('SillyTavern runtime host failed to load.'));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(sawRuntimeDocument
        ? `SillyTavern runtime host did not become ready within ${timeoutMs}ms.`
        : 'SillyTavern runtime host is not same-origin or has no document body.'));
    }, timeoutMs);
    const poll = window.setInterval(handleReady, 100);

    frame.addEventListener('error', handleError, { once: true });
    handleReady();
  });
}

function injectRuntimeModuleBridge(frame: HTMLIFrameElement, timeoutMs: number): Promise<LegacyRuntimeModules> {
  return new Promise((resolve, reject) => {
    const runtimeWindow = frame.contentWindow as LegacyRuntimeWindow | null;
    const runtimeDocument = frame.contentDocument;
    if (!runtimeWindow || !runtimeDocument?.body) {
      reject(new Error('SillyTavern runtime host is not same-origin or has no document body.'));
      return;
    }

    if (runtimeWindow.__ST_REFORGED_RUNTIME_MODULES__) {
      resolve(runtimeWindow.__ST_REFORGED_RUNTIME_MODULES__);
      return;
    }

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`SillyTavern runtime modules did not resolve within ${timeoutMs}ms.`));
    }, timeoutMs);
    const poll = window.setInterval(() => {
      const modules = runtimeWindow.__ST_REFORGED_RUNTIME_MODULES__;
      if (modules) {
        cleanup();
        resolve(modules);
        return;
      }

      const error = runtimeWindow.__ST_REFORGED_RUNTIME_MODULES_ERROR__;
      if (error) {
        cleanup();
        reject(new Error(error));
      }
    }, 100);

    const bridge = runtimeDocument.createElement('script');
    bridge.type = 'module';
    bridge.textContent = `
      Promise.all([import('/script.js'), import('/scripts/openai.js')])
        .then(([scriptModule, openAIModule]) => {
          const scriptModuleWithContext = {
            ...scriptModule,
            getContext: scriptModule.getContext ?? window.SillyTavern?.getContext,
          };
          window.__ST_REFORGED_RUNTIME_MODULES__ = {
            scriptModule: scriptModuleWithContext,
            openAIModule,
            runtimeGlobal: window,
          };
        })
        .catch((error) => {
          window.__ST_REFORGED_RUNTIME_MODULES_ERROR__ = error instanceof Error ? error.message : String(error);
        });
    `;
    runtimeDocument.body.appendChild(bridge);
  });
}
