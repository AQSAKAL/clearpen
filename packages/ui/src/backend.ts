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

/** The AI features, as streams of events. Locally they run in the app; on the web, on the server. */
export interface AI {
  status(): Promise<LLMStatus>;
  /** `preload` loads the writing model into memory now, so the next answer starts quickly. */
  setModels(models: ModelChoice, opts?: { preload?: boolean }): void;
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
    input: { title?: string; before: string; heading?: string; notes?: string[]; brief?: Brief; opening?: string },
    opts?: TaskOptions,
  ): AsyncIterable<NextSentenceEvent>;
  /** After a guided frame is filled: what the sentence leaves unsaid, and the next frame's question. */
  guide(input: GuideInput, opts?: TaskOptions): Promise<GuideReply>;
  /** The writer's question, answered from their saved sources alone, with the passages it came from. */
  askSources(input: SourceQuestion, opts?: TaskOptions): Promise<SourceAnswer>;
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

  /** Opens a web page in the writer's browser. */
  openLink(url: string): Promise<void>;
  /**
   * Fetches a page the writer adds as a source, once, when they add or
   * refresh it — the one request Clearpen makes to the web for the writing.
   * Absent where the app can't reach the web; text can still be pasted.
   */
  fetchPage?(url: string, opts?: TaskOptions): Promise<FetchedPage>;
  /** The computer's memory in bytes, to offer a model that fits; null when it can't tell. */
  memory(): Promise<number | null>;

  /** Runs `save` before the window closes, and waits for it. Returns a function that stops listening. */
  beforeClose?(save: () => Promise<void>): () => void;
}
