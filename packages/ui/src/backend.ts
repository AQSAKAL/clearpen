// Everything the interface needs from the outside world. The desktop app
// implements it with SQLite, files and Ollama on the machine; tests and the
// browser preview implement it in memory; the web app will implement it over
// HTTP. The UI never calls Tauri, SQLite or a model server directly.

import type { LLMStatus } from '@margin/core';
import type { Library } from '@margin/db';

export interface StoredImage {
  /** The Markdown source to write: `media/<hash>.<ext>`. */
  src: string;
  type: string;
  bytes: number;
}

export interface Backend {
  /** Where things are kept, in words the UI can show ("on this Mac"). */
  readonly where: string;
  readonly platform: 'mac' | 'windows' | 'linux' | 'web';
  /** The window's title bar is drawn over the app (macOS), so the app leaves room for it. */
  readonly overlayTitleBar: boolean;

  library: Library;

  media: {
    /** Stores a pasted or dropped image; refuses files that aren't PNG, JPEG, GIF or WebP, or are too big. */
    add(file: Blob): Promise<StoredImage>;
    /** A URL the page can show for an image's Markdown source, or null. */
    url(src: string): string | null;
    /** The image as a data URL, for exports that must stand alone. */
    dataUrl(src: string): Promise<string | null>;
  };

  files: {
    /** Saves a file the writer names (desktop) or downloads it (browser). False if they cancelled. */
    save(suggestedName: string, contents: string, type: string): Promise<boolean>;
  };

  ai: {
    status(): Promise<LLMStatus>;
  };

  /** Runs `save` before the window closes, and waits for it. Returns a function that stops listening. */
  beforeClose?(save: () => Promise<void>): () => void;
}
