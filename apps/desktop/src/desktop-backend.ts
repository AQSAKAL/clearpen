// Margin on the desktop: the library in one SQLite file, images in a folder
// beside it, and models from Ollama on this machine. Both live in the app's
// folder: ~/Library/Application Support/<identifier>/ on a Mac.

import { createLLM, createOllama, IMAGE_TYPES, type ImageExt, MEDIA_SRC, prepareImage } from '@margin/core';
import { openLibrary, type SqlDriver } from '@margin/db';
import type { Backend } from '@margin/ui';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appConfigDir, join, sep } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, exists, mkdir, readFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import Database from '@tauri-apps/plugin-sql';

const inAppFolder = { baseDir: BaseDirectory.AppConfig };

// Ollama turns away origins it doesn't know, and on Windows the app's origin
// is http://tauri.localhost. A native app needs no Origin at all: an empty one
// tells the HTTP plugin to send none (its "unsafe-headers" feature).
const localFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Origin', '');
  return tauriFetch(input, { ...init, headers });
};

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const SAVE_FILTERS: Record<string, { name: string; extensions: string[] }> = {
  'text/markdown': { name: 'Markdown', extensions: ['md'] },
  'text/html': { name: 'Web page', extensions: ['html'] },
};

export async function createDesktopBackend(): Promise<Backend> {
  const db = await Database.load('sqlite:library.db');
  const driver: SqlDriver = {
    async run(sql, params) {
      await db.execute(sql, params);
    },
    all: (sql, params) => db.select<Record<string, unknown>[]>(sql, params),
    async exec(sql) {
      await db.execute(sql);
    },
  };
  const library = await openLibrary(driver);

  const mediaDir = await join(await appConfigDir(), 'media');
  await mkdir('media', { ...inAppFolder, recursive: true });
  const mediaFile = (src: string) => {
    const m = MEDIA_SRC.exec(src);
    return m ? { name: `${m[1]}.${m[2]}`, type: IMAGE_TYPES[m[2] as ImageExt] } : null;
  };

  const llm = createLLM({ provider: createOllama({ fetch: localFetch }) });
  const mac = /Mac/.test(navigator.userAgent);

  return {
    where: 'on this computer',
    platform: mac ? 'mac' : /Windows/.test(navigator.userAgent) ? 'windows' : 'linux',
    overlayTitleBar: mac,
    library,

    media: {
      async add(file) {
        const img = await prepareImage(file);
        const path = `media/${img.name}`;
        if (!(await exists(path, inAppFolder))) await writeFile(path, img.bytes, inAppFolder);
        await library.media.record({ sha256: img.sha256, type: img.type, size: img.bytes.length, name: img.name });
        return { src: img.src, type: img.type, bytes: img.bytes.length };
      },
      url(src) {
        const f = mediaFile(src);
        return f ? convertFileSrc(`${mediaDir}${sep()}${f.name}`) : null;
      },
      async dataUrl(src) {
        const f = mediaFile(src);
        if (!f) return null;
        return `data:${f.type};base64,${base64(await readFile(`media/${f.name}`, inAppFolder))}`;
      },
    },

    files: {
      async save(suggestedName, contents, type) {
        const filter = SAVE_FILTERS[type];
        const path = await save({ defaultPath: suggestedName, ...(filter ? { filters: [filter] } : {}) });
        if (!path) return false;
        await writeTextFile(path, contents);
        return true;
      },
    },

    ai: { status: () => llm.status() },

    beforeClose(saveAll) {
      const stop = getCurrentWindow().onCloseRequested(async () => {
        await saveAll().catch((err) => console.error('Couldn’t save before closing', err));
      });
      return () => void stop.then((unlisten) => unlisten());
    },
  };
}
