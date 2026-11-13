import {
  createLLM,
  createOllama,
  createOpenRouter,
  createWebLLM,
  prepareImage,
  WEBLLM_DEFAULT_MODEL,
  WEBLLM_MODELS,
  webllmSupported,
} from '@clearpen/core';
import {
  type AppEvent,
  type Backend,
  type EventInput,
  type EventsService,
  localAI,
  pageFetcher,
  type SecretName,
} from '@clearpen/ui';
import { createBrowserExplorer } from './browser-files.ts';
import { openBrowserStorage } from './browser-storage.ts';

// A self-host can link its existing browser terminal or opencode web interface.
function toolUrl(configured: string | undefined) {
  if (!configured) return undefined;
  const url = new URL(configured, location.href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Web tool URLs must use HTTP or HTTPS.');
  return url.href;
}

export async function createBrowserBackend(): Promise<Backend> {
  if (!window.isSecureContext) throw new Error('Open Clearpen over HTTPS or localhost to save your library.');
  const { library, images, putImage } = await openBrowserStorage();
  const params = new URLSearchParams(location.search);
  const ollama = params.get('ollama');
  // With WebGPU the model runs in the page, so the browser needs no Ollama.
  // `?ollama=<url>` keeps the old server path; `?webllm=0` turns the page model
  // off; `?model=<id>` picks another prebuilt WebLLM model.
  const inPage = !ollama && params.get('webllm') !== '0' && webllmSupported();
  const llm = createLLM({
    provider: inPage
      ? createWebLLM({
          model: params.get('model') ?? WEBLLM_DEFAULT_MODEL,
          contextWindowSize: 8192,
          debug: params.get('debug') === '1',
        })
      : createOllama(ollama ? { baseUrl: ollama } : {}),
    ...(inPage ? { preferred: [...WEBLLM_MODELS] } : {}),
  });
  // Start the download now rather than on the first suggestion; Cache Storage
  // keeps it across reloads.
  if (inPage)
    void llm
      .modelFor('quick')
      .then((m) => llm.provider.preload(m))
      .catch((err: unknown) => console.error('[clearpen] the browser model did not load:', err));

  // A key typed into the browser preview lives in this tab's memory only: no
  // localStorage, no IndexedDB, gone when the tab closes. The desktop app is
  // where a key can be kept, in the operating system's credential store.
  const keys = new Map<SecretName, string>();
  const secrets: Backend['secrets'] = {
    persistent: false,
    get: async (name) => keys.get(name) ?? null,
    set: async (name, value) => {
      keys.set(name, value);
    },
    delete: async (name) => {
      keys.delete(name);
    },
  };

  // The browser preview has no Rust hub; this is the same stream in memory.
  const listeners = new Set<(event: AppEvent) => void>();
  const events: EventsService = {
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(input: EventInput) {
      const at = Date.now();
      const event: AppEvent = {
        id: crypto.randomUUID(),
        kind: input.kind,
        source: input.source ?? 'browser',
        at,
        data: input.data ?? null,
      };
      for (const listener of listeners) listener(event);
    },
  };

  return {
    where: 'in this browser on this device',
    explorer: createBrowserExplorer(),
    webTerminalUrl: toolUrl(import.meta.env.VITE_TERMINAL_URL),
    webRunnerUrl: toolUrl(import.meta.env.VITE_OPENCODE_URL),
    platform: /Mac/.test(navigator.userAgent) ? 'mac' : 'web',
    overlayTitleBar: false,
    library,
    events,
    media: {
      async add(file) {
        const img = await prepareImage(file);
        await putImage(img.src, img.bytes, img.type);
        await library.media.record({ sha256: img.sha256, type: img.type, size: img.bytes.length, name: img.name });
        return { src: img.src, type: img.type, bytes: img.bytes.length };
      },
      url: (src) => images.get(src)?.url ?? null,
      async dataUrl(src) {
        const img = images.get(src);
        if (!img) return null;
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(img.blob);
        });
      },
    },
    files: {
      async save(name, contents, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([contents], { type }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return true;
      },
    },
    ai: localAI(llm, { openRouter: (apiKey) => createOpenRouter({ apiKey }) }),
    secrets,
    async openLink(url) {
      window.open(url, '_blank', 'noopener');
    },
    // Most sites don't allow another origin to read them (CORS): pasting the text works everywhere.
    fetchPage: pageFetcher((input, init) => window.fetch(input, init)),
    // Browsers don't say (Chrome caps its answer at 8 GB).
    memory: async () => null,
  };
}
