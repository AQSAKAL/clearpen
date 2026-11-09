// Everything the interface needs from the outside world. The desktop app
// implements it with SQLite, files and Ollama on the machine; tests and the
// browser preview implement it in memory; the web app will implement it over
// HTTP. The UI never calls Tauri, SQLite or a model server directly.

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
