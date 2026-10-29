// The editor's public types: the options the app passes in, and the API it gets back.

import type { EditorView, Rect } from '@codemirror/view';

/** 'streaming' while the model is still writing it; 'ready' once it can be accepted. */
export type SuggestionStatus = 'streaming' | 'ready';

/** A tracked change: `from`–`to` replaced by `insert`, shown in the text until accepted or rejected. */
export interface Suggestion {
  id: string;
  from: number;
  to: number;
  insert: string;
  /** Shown before Accept and Reject, e.g. "Outline". */
  label: string;
  status: SuggestionStatus;
  /** Suggestions from one instruction share a group; ⌘↵ and Esc act on all of it. */
  group: string;
  /** One of several pinpoint changes: shown with just ✓ and ✕. */
  compact: boolean;
  /** What to check before accepting (changed figures, unverified names); empty when there's nothing. */
  warning: string;
}

/** A new suggestion. Anything left out is empty, and the status starts as 'streaming'. */
export interface SuggestionInput {
  from: number;
  to: number;
  insert?: string;
  label?: string;
  status?: SuggestionStatus;
  group?: string;
  compact?: boolean;
  warning?: string;
}

/**
 * The ghost text at the cursor. `display`, when set, is shown instead of
 * `text` ("¶ point made"). A `frame` is a guided-writing frame — a sentence
 * with a blank — shown in the prose's face with nothing to insert: the author
 * types the whole sentence, and Tab does nothing. `pending` is a suggestion on
 * its way: dots at the cursor, `display` read out to a screen reader, and
 * nothing to insert yet.
 */
export interface Ghost {
  pos: number;
  text: string;
  display?: string;
  kind?: 'frame' | 'pending';
}

/** One of autocorrect's fixes: from–to becomes `insert`. */
export interface EditorFix {
  from: number;
  to: number;
  insert: string;
}

/** A review note's place in the text. */
export interface EditorNote {
  id: string;
  from: number;
  to: number;
  /** Picks the colour: clarity, concision, … or coach. */
  category: string;
}

/** A writing-analysis highlight: a long sentence, a passive, an adverb… */
export interface AnalysisRange {
  from: number;
  to: number;
  /** vlong, long, passive, adverb, weak or cliche. */
  kind: string;
  /** Shown on hover. */
  title?: string;
}

/** What changed, for onUpdate. */
export interface EditorUpdate {
  docChanged: boolean;
  selectionSet: boolean;
  focusChanged: boolean;
  /** The writer typed or pressed Enter, as opposed to taking a suggested sentence. */
  userEdit: boolean;
  /** Ghost text was accepted. */
  ghostAccepted: boolean;
  /** Where the text the writer typed now is — usually one keystroke; more from dictation or an input method. */
  typed: readonly { from: number; to: number }[];
  /** The only change was autocorrect fixing words: ghost text and the cursor moved with it. */
  corrected: boolean;
  /** Where a position from before the update is now. */
  mapPos(pos: number, assoc?: -1 | 1): number;
}

/** Callbacks are read when they're needed, so the app may swap them on this object later. */
export interface EditorOptions {
  /** The Markdown to start with. */
  doc?: string;
  /** Shown while the document is empty. Defaults to "Start writing…". */
  placeholder?: string;
  /** After an edit, a selection change or a focus change. */
  onUpdate?: (update: EditorUpdate) => void;
  /** When the editor's layout changes, so the margin can move its notes. */
  onGeometry?: () => void;
  /** After a suggestion is accepted. From acceptSuggestions, `count` is how many changes were applied. */
  onAccept?: (id: string, suggestion: Suggestion & { count?: number }) => void;
  /** After a suggestion is rejected. rejectSuggestion with an unknown id passes undefined. */
  onReject?: (id: string, suggestion: Suggestion | undefined) => void;
  /** On every click in the text: the note clicked, or null. */
  onNoteClick?: (id: string | null) => void;
  /** Image files pasted or dropped, for the app to store and write in at from–to. Without it they paste as usual. */
  onImages?: (files: File[], from: number, to: number) => void;
  /** ⌘J. Return true when it's handled. */
  onRequestCompletion?: () => boolean;
  /** "Shape this section" was clicked on the heading that starts at `from`. Without it there are no buttons. */
  onWriteSection?: (from: number) => void;
  /**
   * The URL to show a Markdown image with, or null to show nothing. It gets https:// URLs and plain
   * paths such as media/<hash>.png — never another scheme. It runs on every edit, so keep it fast.
   * The default shows https:// images only.
   */
  resolveImage?: (src: string) => string | null;
  /**
   * Put TradingView's `<tv-ticker-tag>` after each ticker in the text ($AAPL, NASDAQ:AAPL). The app
   * loads the element's script; without it the tag shows nothing. Off by default; see setTickers.
   */
  tickers?: boolean;
}

/** What createEditor returns: everything the app needs, without touching CodeMirror. */
export interface ClearpenEditor {
  /** The CodeMirror view, for what the API doesn't cover. */
  readonly view: EditorView;

  getText(): string;
  /**
   * Loads a different document with a clean undo history and nothing left over: no suggestions, notes,
   * highlights or ghost text, focus mode off, and tickers as the `tickers` option says.
   */
  setText(text: string): void;
  focus(): void;
  slice(from: number, to?: number): string;
  length(): number;
  /** The cursor's position (the main selection's head). */
  cursor(): number;

  getSelection(): { from: number; to: number; text: string; empty: boolean };
  setSelection(from: number, to?: number, scroll?: boolean): void;
  coordsAt(pos: number, side?: -1 | 1): Rect | null;
  /** How far `pos` is from the top of the document, in pixels: exact when its line is drawn, estimated when not. */
  topOf(pos: number): number;
  documentTop(): number;
  lineAt(pos: number): { from: number; to: number; text: string; number: number };
  /** Scrolls `pos` to the middle of the view. */
  scrollTo(pos: number): void;

  /** Replaces from–to as an AI edit, optionally selecting the new text. */
  replace(from: number, to: number, insert: string, options?: { select?: boolean }): void;
  /** Inserts as an AI edit and puts the cursor after it. */
  insertAt(pos: number, insert: string): void;
  undo(): boolean;
  redo(): boolean;

  /**
   * Makes autocorrect's fixes, all of them one undo step of their own, and underlines them for a
   * moment. Fixes on words the writer put back by undoing a fix, outside prose, or during an input
   * method's composition are skipped. Returns how many were made.
   */
  correct(fixes: readonly EditorFix[]): number;
  /** Is from–to prose — not code, a link's address, an image, HTML or a table? */
  isProse(from: number, to: number): boolean;

  /**
   * Shows ghost text at `pos`; `display`, if given, is shown instead of `text`.
   * A `frame` ghost shows a sentence with a blank to complete and inserts nothing;
   * a `pending` one shows that a suggestion is on its way.
   */
  showGhost(pos: number, text: string, display?: string, kind?: Ghost['kind']): void;
  ghost(): Ghost | null;
  clearGhost(): void;
  /** Inserts the ghost text; false when there's none. */
  acceptGhost(): boolean;

  /** Adds a tracked suggestion and returns its id. */
  addSuggestion(input: SuggestionInput): string;
  updateSuggestion(id: string, patch: Partial<Omit<Suggestion, 'id'>>): void;
  suggestion(id: string): Suggestion | null;
  suggestions(): readonly Suggestion[];
  acceptSuggestion(id: string): void;
  /** Accepts several suggestions in one undoable step. Of two that overlap, the first is applied. */
  acceptSuggestions(ids: readonly string[]): void;
  rejectSuggestion(id: string): void;
  rejectSuggestions(ids: readonly string[]): void;

  /** Replaces the notes; ones that don't fit the document are dropped. */
  setNotes(notes: readonly EditorNote[]): void;
  notes(): readonly EditorNote[];
  removeNote(id: string): void;
  /** Highlights one note (or none), optionally scrolling it to the middle. */
  activateNote(id: string | null, scroll?: boolean): void;

  /** Replaces the analysis highlights; empty or null clears them. */
  setAnalysis(ranges: readonly AnalysisRange[] | null | undefined): void;
  /** Focus mode: dims everything but the paragraph being written. */
  setFocus(on: boolean): void;
  /** Live prices: TradingView's tag after each ticker, on or off. */
  setTickers(on: boolean): void;
  destroy(): void;
}
