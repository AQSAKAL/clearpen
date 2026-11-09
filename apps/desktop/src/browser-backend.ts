// For developing the interface in a browser (`pnpm dev`, outside Tauri): the
// real library code on SQLite compiled to WebAssembly, held in memory, with
// the model running in the page through WebLLM when WebGPU is available, or
// Ollama reached directly (it allows localhost origins). Never in a build.
// `?webllm=0` turns the page model off; `?ollama=<url>` points Ollama
// elsewhere — at nothing, to see first-run setup.

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
import { openLibrary, type SqlDriver } from '@clearpen/db';
import { type Backend, localAI, pageFetcher, type SecretName } from '@clearpen/ui';
import initSqlJs, { type BindParams } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export async function createBrowserBackend(): Promise<Backend> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  const driver: SqlDriver = {
    async run(sql, params) {
      db.run(sql, params as BindParams);
    },
    async all(sql, params) {
      const stmt = db.prepare(sql);
      stmt.bind(params as BindParams);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    async exec(sql) {
      db.exec(sql);
    },
  };
  const library = await openLibrary(driver);
  const images = new Map<string, { blob: Blob; url: string }>();
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

  return {
    where: 'in this browser tab (not saved)',
    platform: /Mac/.test(navigator.userAgent) ? 'mac' : 'web',
    overlayTitleBar: false,
    library,
    media: {
      async add(file) {
        const img = await prepareImage(file);
        const blob = new Blob([img.bytes], { type: img.type });
        if (!images.has(img.src)) images.set(img.src, { blob, url: URL.createObjectURL(blob) });
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
