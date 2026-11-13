// Clearpen on the desktop: the library in one SQLite file, images in a folder
// beside it, and models from Ollama on this machine. Both live in the app's
// folder: ~/Library/Application Support/<identifier>/ on a Mac.

import {
  createLLM,
  createOllama,
  createOpenRouter,
  IMAGE_TYPES,
  type ImageExt,
  MEDIA_SRC,
  prepareImage,
} from '@clearpen/core';
import { openLibrary, type SqlDriver } from '@clearpen/db';
import {
  type AppEvent,
  type Backend,
  type EventInput,
  type EventsService,
  type FileEntry,
  type FilePlaces,
  type FilesService,
  type FolderSize,
  type LargeFiles,
  localAI,
  type ModelChoice,
  pageFetcher,
  type SecretName,
  type TerminalService,
  type WebAppsService,
} from '@clearpen/ui';
import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appConfigDir, homeDir, join, sep } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, exists, mkdir, readFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
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

/**
 * The webview opens no windows of its own, so a `window.open` — TradingView's
 * "Launch full view" behind a ticker's price tag — would do nothing. Web links
 * go to the browser instead, through the opener plugin, whose scope in
 * capabilities/default.json says which sites may open; any other is refused
 * there. The app's own links use openLink. (The plugin does the same for
 * `<a target="_blank">`; this covers the call.)
 */
function openNewWindowsInBrowser(): void {
  const native = window.open.bind(window);
  window.open = (url, target, features) => {
    const href = url == null ? '' : String(url);
    if (!/^https?:\/\//i.test(href)) return native(url, target, features);
    openUrl(href).catch((err) => console.warn(`Couldn’t open ${href} in the browser`, err));
    return null;
  };
}

export async function createDesktopBackend(): Promise<Backend> {
  openNewWindowsInBrowser();
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

  const ai = localAI(() => createLLM({ provider: createOllama({ fetch: localFetch }) }), {
    openRouter: (apiKey) => createOpenRouter({ apiKey, fetch: localFetch }),
  });
  const secrets: Backend['secrets'] = {
    persistent: true,
    get: (name: SecretName) => invoke<string | null>('secret_get', { name }),
    set: (name: SecretName, value: string) => invoke<void>('secret_set', { name, value }),
    delete: (name: SecretName) => invoke<void>('secret_delete', { name }),
  };
  // OpenRouter, when it was chosen last time and its key is still in the
  // keychain. A failure here (the keychain is locked, the network is down)
  // leaves the local models in place; the writer can reconnect in Models.
  const savedProvider = await library.settings.get<'local' | 'openrouter'>('aiProvider');
  if (savedProvider === 'openrouter') {
    const key = await secrets.get('openrouter').catch(() => null);
    if (key) {
      const models = (await library.settings.get<ModelChoice>('openrouterModels').catch(() => undefined)) ?? {};
      await ai
        .switchToOpenRouter(key, models)
        .catch((err: unknown) => console.error('Couldn’t reach OpenRouter; using this computer’s models.', err));
    }
  }
  const mac = /Mac/.test(navigator.userAgent);

  // A pseudo-terminal per tab. Output comes over a channel, keyed to the tab's
  // id; input and resizing go back as commands. The shell stays in Rust, so
  // closing the window ends it with the app.
  const terminal: TerminalService = {
    async open(options) {
      const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const channel = new Channel<ArrayBuffer>();
      channel.onmessage = (message) => {
        const data = new Uint8Array(message);
        // An empty chunk is the shell ending; the rest is what it wrote.
        if (data.byteLength === 0) options.onExit();
        else options.onData(data);
      };
      await invoke('terminal_open', {
        id,
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd ?? null,
        shell: options.shell ?? null,
        command: options.command ?? null,
        onOutput: channel,
      });
      return {
        write(data) {
          void invoke('terminal_write', { id, data }).catch(() => {});
        },
        resize(cols, rows) {
          void invoke('terminal_resize', { id, cols, rows }).catch(() => {});
        },
        close() {
          void invoke('terminal_close', { id }).catch(() => {});
        },
      };
    },
    defaultShell: () => invoke<string>('terminal_default_shell'),
    defaultCwd: () => homeDir(),
    async chooseFolder() {
      const dir = await openDialog({
        directory: true,
        multiple: false,
        title: 'Choose a folder for the terminal',
      });
      return typeof dir === 'string' ? dir : null;
    },
  };

  // Telegram, WhatsApp, X, Google and Wikipedia: one child webview each,
  // kept alive while the app runs. The Rust side owns them; this is the small
  // surface the UI uses.
  const opening = new Map<string, Promise<void>>();
  const webapps: WebAppsService = {
    open({ id, url }) {
      const pending = opening.get(id);
      if (pending) return pending;
      const created = invoke<void>('webapp_open', { label: id, url }).finally(() => opening.delete(id));
      opening.set(id, created);
      return created;
    },
    present(id, bounds) {
      void invoke('webapp_present', { label: id, bounds }).catch(console.error);
    },
    navigate(id, url) {
      void invoke('webapp_navigate', { label: id, url }).catch(() => {});
    },
    action(id, action) {
      void invoke('webapp_action', { label: id, action }).catch(() => {});
    },
    close(id) {
      void invoke('webapp_close', { label: id }).catch(() => {});
    },
    url: (id) => invoke<string | null>('webapp_url', { label: id }),
    onNavigate(listener) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void listen<{ label: string; url: string }>('webapp-navigated', (event) => {
        listener(event.payload.label, event.payload.url);
      })
        .then((unlisten) => {
          if (cancelled) unlisten();
          else stop = unlisten;
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        stop?.();
      };
    },
  };

  const events: EventsService = {
    onEvent(listener) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void listen<AppEvent>('clearpen://event', (event) => listener(event.payload))
        .then((unlisten) => {
          if (cancelled) unlisten();
          else stop = unlisten;
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        stop?.();
      };
    },
    emit(event: EventInput) {
      void invoke('event_emit', { input: event }).catch(() => {});
    },
  };

  const explorer: FilesService = {
    places: () => invoke<FilePlaces>('fs_places'),
    list: (path, options) => invoke<FileEntry[]>('fs_list', { path, showHidden: options?.showHidden ?? false }),
    search: (root, query, options) =>
      invoke<FileEntry[]>('fs_search', {
        root,
        query,
        limit: options?.limit ?? 200,
        showHidden: options?.showHidden ?? false,
      }),
    open: (path) => invoke<void>('fs_open', { path }),
    reveal: (path) => invoke<void>('fs_reveal', { path }),
    folderSizes: (paths) => invoke<FolderSize[]>('fs_folder_sizes', { paths }),
    largeFiles: (root, limit) => invoke<LargeFiles>('fs_large_files', { root, limit: limit ?? 100 }),
    onFolderSize(listener) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void listen<FolderSize>('fs-folder-size', (event) => listener(event.payload))
        .then((unlisten) => {
          if (cancelled) unlisten();
          else stop = unlisten;
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        stop?.();
      };
    },
  };

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

    ai,
    events,
    terminal,
    webapps,
    explorer,
    secrets,
    openLink: (url) => openUrl(url),
    // Through the HTTP plugin, which no page's CORS stops; capabilities/default.json lets it reach the web.
    fetchPage: pageFetcher((input, init) => tauriFetch(input, init)),
    memory: () => invoke<number>('total_memory').catch(() => null),

    beforeClose(saveAll) {
      const stop = getCurrentWindow().onCloseRequested(async () => {
        void invoke('terminal_close_all').catch(() => {});
        await saveAll().catch((err) => console.error('Couldn’t save before closing', err));
      });
      return () => void stop.then((unlisten) => unlisten());
    },
  };
}
