// For developing the interface in a browser (`pnpm dev`, outside Tauri): the
// real library code on SQLite compiled to WebAssembly, held in memory, with
// Ollama reached directly (it allows localhost origins). Never in a build.
// `?ollama=<url>` points it elsewhere — at nothing, to see first-run setup.

import { createLLM, createOllama, prepareImage } from '@clearpen/core';
import { openLibrary, type SqlDriver } from '@clearpen/db';
import { type Backend, localAI } from '@clearpen/ui';
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
  const ollama = new URLSearchParams(location.search).get('ollama');
  const llm = createLLM({ provider: createOllama(ollama ? { baseUrl: ollama } : {}) });

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
    ai: localAI(llm),
    async openLink(url) {
      window.open(url, '_blank', 'noopener');
    },
    // Browsers don't say (Chrome caps its answer at 8 GB).
    memory: async () => null,
  };
}
