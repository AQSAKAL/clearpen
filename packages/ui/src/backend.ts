// Desktop and browser implement this contract. The shared UI opens the same
// library on native SQLite or browser storage and uses the available platform tools.

import type {
  Brief,
  CheckEvent,
  CheckInput,
  EditEvent,
  EditInput,
  Fix,
  GuideInput,
  GuideReply,
  LLMStatus,
  ModelInfo,
  NextSentenceEvent,
  NoticeEvent,
  ProofreadInput,
  PullProgress,
  ReviewEvent,
  RewriteDone,
  RewriteInput,
  Role,
  SourceAnswer,
  SourceQuestion,
  TaskOptions,
  TokenEvent,
} from '@clearpen/core';
import type { Library } from '@clearpen/db';

export interface StoredImage {
  /** The Markdown source to write: `media/<hash>.<ext>`. */
  src: string;
  type: string;
  bytes: number;
}

/** A page as fetched: where it ended up after redirects, its content type, and its text. */
export interface FetchedPage {
  url: string;
  type: string;
  text: string;
}

/** Which model plays which role; a missing or null role uses the best model installed. */
export type ModelChoice = Partial<Record<Role, string | null>>;

/** The names of the secrets Clearpen keeps. An API key is never a setting. */
export type SecretName = 'openrouter';

/**
 * Where API keys live. The desktop app keeps them in the operating system's
 * credential store — the Mac's Keychain, Windows Credential Manager, the
 * Linux Secret Service — never in the library, a settings file or a log. The
 * browser preview keeps them in this tab's memory only, for as long as it is
 * open.
 */
export interface Secrets {
  /** Keys survive a restart (the operating system's store) rather than this session alone. */
  readonly persistent: boolean;
  get(name: SecretName): Promise<string | null>;
  set(name: SecretName, value: string): Promise<void>;
  delete(name: SecretName): Promise<void>;
}

/** One row in the file browser. */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  /** Bytes, for files. */
  size: number | null;
  /** Milliseconds since the Unix epoch, when the filesystem gives one. */
  modified: number | null;
}

export interface FilePlace {
  name: string;
  path: string;
  kind: 'home' | 'desktop' | 'documents' | 'downloads' | 'volume';
}

export interface FilePlaces {
  home: string;
  places: FilePlace[];
}

/** A folder's size, computed in the background. `bytes` is null while pending. */
export interface FolderSize {
  path: string;
  bytes: number | null;
  /** False when the walk hit its time budget or an unreadable folder. */
  complete: boolean;
}

/** The largest files a cleanup scan found, and whether it finished the tree. */
export interface LargeFiles {
  files: FileEntry[];
  scannedMs: number;
  complete: boolean;
}

/**
 * The native file browser. Listing and search touch the filesystem directly in
 * the desktop shell, so they are not bound by the library folder. The browser indexes files in a directory selected by the user.
 */
export interface FilesService {
  places(): Promise<FilePlaces>;
  list(path: string, options?: { showHidden?: boolean }): Promise<FileEntry[]>;
  /** Parallel path search under `root`; stops at a time/result budget. */
  search(root: string, query: string, options?: { limit?: number; showHidden?: boolean }): Promise<FileEntry[]>;
  /** Opens a file or folder with the system's default application. */
  open(path: string): Promise<void>;
  /** Shows the file or folder in Finder/Explorer. */
  reveal?(path: string): Promise<void>;
  /** Browse a directory explicitly selected in the browser. */
  selectFolder?(files: FileList): void;
  /** Cached sizes immediately; missing ones are computed and sent via `onFolderSize`. */
  folderSizes(paths: string[]): Promise<FolderSize[]>;
  /** Background folder-size results, as each one finishes. */
  onFolderSize(listener: (size: FolderSize) => void): () => void;
  /** The largest files under `root`, for the Cleanup view. Read-only. */
  largeFiles(root: string, limit?: number): Promise<LargeFiles>;
}

/** One event from the app's event hub. `data` is free-form JSON. */
export interface AppEvent {
  id: string;
  kind: string;
  source: string;
  /** Milliseconds since the Unix epoch. */
  at: number;
  data: unknown;
}

/** An event to emit. The hub adds the id, time and a default source. */
export interface EventInput {
  kind: string;
  source?: string;
  data?: unknown;
}

/**
 * The app's event hub: one subscription for everything that happens. The
 * desktop shell broadcasts events from Rust; the browser preview keeps an
 * in-memory hub. Events are stored in the `interactions` table.
 */
export interface EventsService {
  onEvent(listener: (event: AppEvent) => void): () => void;
  emit(event: EventInput): void;
}

/**
 * One terminal: a shell process on this computer, drawn by xterm.js in the
 * window. It exists only while its tab does.
 */
export interface TerminalSession {
  /** Keystrokes, exactly as typed. */
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ends the shell and forgets the session. */
  close(): void;
}

export interface TerminalOpenOptions {
  cols: number;
  rows: number;
  /** Where the shell starts. Defaults to the writer's home folder. */
  cwd?: string;
  /** A command line to start instead of an interactive prompt, e.g. "opencode". */
  command?: string;
  /** The shell to run; defaults to the writer's own. */
  shell?: string;
  /** Raw bytes from the shell, as they arrive. */
  onData(data: Uint8Array): void;
  /** The shell ended; the tab can say so and offer a new one. */
  onExit(): void;
}

/**
 * The integrated terminal, where the platform has one. The desktop app gives
 * it a pseudo-terminal; the browser has no place to run one, so it leaves
 * `Backend.terminal` out.
 */
export interface TerminalService {
  open(options: TerminalOpenOptions): Promise<TerminalSession>;
  /** The shell Clearpen would start. */
  defaultShell(): Promise<string>;
  /** The writer's home folder. */
  defaultCwd(): Promise<string>;
  /** Ask the writer for a folder to start in; null when they cancel. */
  chooseFolder?(): Promise<string | null>;
}

/** The rectangle a web app may cover, in CSS pixels relative to the window. */
export interface WebAppBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * An embedded web app: Telegram, WhatsApp, X, Google, Wikipedia. Each runs in its own
 * child webview, with its own cookies and storage, so it stays logged in.
 */
export interface WebAppsService {
  /** Ensures the child exists without bringing it forward. */
  open(options: { id: string; url: string }): Promise<void>;
  /** Place the child in its host rectangle, or hide it without ending its session. */
  present(id: string, bounds: WebAppBounds | null): void;
  navigate(id: string, url: string): void;
  action(id: string, action: 'back' | 'forward' | 'reload'): void;
  close(id: string): void;
  /** The page a web app is on now, or null if it isn't open. */
  url(id: string): Promise<string | null>;
  /** The page a web app is on, after links and redirects. Returns an unsubscribe. */
  onNavigate(listener: (id: string, url: string) => void): () => void;
}

/** The AI features, as streams of events. Locally they run in the app; on the web, on the server. */
export interface AI {
  status(): Promise<LLMStatus>;
  /** `preload` loads the writing model into memory now, so the next answer starts quickly. */
  setModels(models: ModelChoice, opts?: { preload?: boolean }): void;
  /** This build can reach OpenRouter with a key from the writer. */
  readonly openRouter: boolean;
  /**
   * Writes through the writer's OpenRouter key. A model is chosen from
   * OpenRouter's catalogue when `models` doesn't name one.
   */
  switchToOpenRouter(apiKey: string, models?: ModelChoice): Promise<LLMStatus>;
  /** Goes back to the models on this computer. */
  switchToLocal(models?: ModelChoice): Promise<LLMStatus>;
  /** The active provider's models, with what it says about each, for a picker. */
  catalogue(): Promise<ModelInfo[]>;
  /** The models on this computer, whether or not OpenRouter is in use. */
  localStatus(): Promise<LLMStatus>;
  rewrite(input: RewriteInput, opts?: TaskOptions): AsyncIterable<NoticeEvent | TokenEvent | RewriteDone>;
  edit(input: EditInput, opts?: TaskOptions): AsyncIterable<EditEvent>;
  /** An editor's notes on the whole draft. */
  review(input: { title?: string; content: string; brief?: Brief }, opts?: TaskOptions): AsyncIterable<ReviewEvent>;
  /** Verdicts on a passage: its facts, its logic, or its consistency with the draft. */
  check(input: CheckInput, opts?: TaskOptions): AsyncIterable<CheckEvent>;
  /** Downloads a model onto this computer, where the model server can (Ollama). */
  pull?(model: string, opts?: TaskOptions): AsyncIterable<PullProgress>;
  /** The slips in a sentence just written, as safe fixes with offsets into it. */
  proofread(input: ProofreadInput, opts?: TaskOptions): Promise<Fix[]>;
  /** Has the paragraph before the cursor made its point? If not, the one sentence it's missing, as it's written. */
  nextSentence(
    input: {
      title?: string;
      before: string;
      anywhere?: boolean;
      heading?: string;
      notes?: string[];
      brief?: Brief;
      opening?: string;
    },
    opts?: TaskOptions,
  ): AsyncIterable<NextSentenceEvent>;
  /** After a guided frame is filled: what the sentence leaves unsaid, and the next frame's question. */
  guide(input: GuideInput, opts?: TaskOptions): Promise<GuideReply>;
  /** The writer's question, answered from their saved sources alone, with the passages it came from. */
  askSources(input: SourceQuestion, opts?: TaskOptions): Promise<SourceAnswer>;
  /** The current paragraph's sentences, each labelled by its role (point/support/meaning). */
  thoughtTree(
    input: { before: string },
    opts?: TaskOptions,
  ): Promise<{ sentences: { index: number; text: string; role: string }[] }>;
  /** The phrases in a passage that carry importance (bold), significance (italic) or consequence (underline), as spans. */
  emphasize(
    input: { title?: string; text: string; before?: string; after?: string },
    opts?: TaskOptions,
  ): Promise<{ spans: { from: number; to: number; kind: 'bold' | 'italic' | 'underline'; text: string }[] }>;
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

  ai: AI;

  /** Everything that happens, in one stream; the window stores it and listens. */
  events: EventsService;

  /** The integrated terminal; absent where the platform can't run a shell. */
  terminal?: TerminalService;
  /** Existing web tools supplied by the self-hosting operator. */
  webTerminalUrl?: string;
  webRunnerUrl?: string;

  /** Telegram, WhatsApp, X, Google and Wikipedia, in child webviews; desktop only. */
  webapps?: WebAppsService;

  /** The file browser, scoped to the selected directory on the web. */
  explorer?: FilesService;

  /** The writer's API keys, kept out of the library and out of any settings file. */
  secrets: Secrets;

  /** Opens a web page in the writer's browser. */
  openLink(url: string): Promise<void>;
  /**
   * Fetches a page from the web: one the writer adds as a source (once, when
   * they add or refresh it), or Ollama's model library, to choose a model.
   * Nothing of the writer's is sent either way. Absent where the app can't
   * reach the web; text can still be pasted, and a model named by hand.
   */
  fetchPage?(url: string, opts?: TaskOptions): Promise<FetchedPage>;
  /** The computer's memory in bytes, to offer a model that fits; null when it can't tell. */
  memory(): Promise<number | null>;

  /** Runs `save` before the window closes, and waits for it. Returns a function that stops listening. */
  beforeClose?(save: () => Promise<void>): () => void;
}
