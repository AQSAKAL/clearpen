// Writing modes: a preset that bundles what kind of piece this is — the
// genre, which decides Clearpen's own checks and the reader the review reads
// for — with which aids are on, how the review reads, and, for some modes, a
// guided template of frames to fill. "Clear out ideas" is free writing:
// nothing checks or suggests while the author thinks, and the review
// afterwards listens rather than edits. Reflect and Work a problem are that,
// plus their frames. Every genre is also a mode, so an older brief that only
// names a genre still finds its mode.

import { GENRES, type Genre } from './checks.ts';
import type { TemplateId } from './guide.ts';
import type { Brief } from './prompts.ts';

export const MODES = [
  'article',
  'clear',
  'reflect',
  'problem',
  'scientific',
  'technical',
  'business',
  'investment',
] as const;
export type ModeId = (typeof MODES)[number];

/** The aids that work while the author writes. */
export interface ModeAids {
  /** The next-sentence suggestion after a finished sentence and a pause. */
  next: boolean;
  /** Typo fixes as the author types. */
  typos: boolean;
  /** Clearpen's own notes on how the prose reads: style, clarity, structure, terms. */
  style: boolean;
  /** A live price beside each ticker the piece names — $AAPL, NASDAQ:AAPL — from TradingView. */
  tickers: boolean;
}

export interface Mode {
  id: ModeId;
  /** What the writer calls it: "Clear out ideas". */
  label: string;
  /** One line under the picker: what the mode changes. */
  hint: string;
  /** Which of Clearpen's checks run, and who the review reads for. */
  genre: Genre;
  /** Whether Clearpen's own checks run at all — numbers, logic, consistency, terms. */
  checks: boolean;
  aids: ModeAids;
  /** How the review reads: an editor with notes to fix, or a listener who says what is there. */
  review: 'editor' | 'listener';
  /** What the author is doing, told to the coach. */
  coach?: string;
  /** A guided template: started on an empty page at once, or offered. */
  template?: { id: TemplateId; start: 'now' | 'offer' };
}

// Every aid but prices, which only a piece about companies wants.
const ALL: ModeAids = { next: true, typos: true, style: true, tickers: false };
// Free writing: nothing suggests a sentence or notes the prose while the
// author thinks (Galbraith: spontaneous drafting produces ideas planning does
// not, if left alone). Typo fixes stay: the author's own words, spelled right.
const FREE: ModeAids = { next: false, typos: true, style: false, tickers: false };

const THINKING =
  'The author is writing to think, not to publish: ask about what they mean, feel, want or have tried — never about the prose.';

export const MODE: Record<ModeId, Mode> = {
  article: {
    id: 'article',
    label: 'An article',
    hint: 'Pinpoint edits, Clearpen’s checks, and a review for an intelligent, busy reader.',
    genre: 'article',
    checks: true,
    aids: ALL,
    review: 'editor',
  },
  clear: {
    id: 'clear',
    label: 'Clear out ideas',
    hint: 'Free writing. Nothing checks or suggests while you think; Review listens afterwards.',
    genre: 'article',
    checks: false,
    aids: FREE,
    review: 'listener',
    coach: THINKING,
  },
  reflect: {
    id: 'reflect',
    label: 'Reflect',
    hint: 'Three sentences, one at a time: what you feel, where it comes from, what you want instead.',
    genre: 'article',
    checks: false,
    aids: FREE,
    review: 'listener',
    coach: THINKING,
    template: { id: 'reflect', start: 'now' },
  },
  problem: {
    id: 'problem',
    label: 'Work a problem',
    hint: 'Five frames: the problem, why it matters, what you’ve tried, what stops you, ways forward.',
    genre: 'article',
    checks: false,
    aids: FREE,
    review: 'listener',
    coach: THINKING,
    template: { id: 'problem', start: 'now' },
  },
  scientific: {
    id: 'scientific',
    label: 'A scientific paper',
    hint: 'Read for a reviewer with a few hours: the result stated early, every term defined. A skeleton to start from.',
    genre: 'scientific',
    checks: true,
    aids: ALL,
    review: 'editor',
    coach:
      'The author is writing a scientific paper: ask for the question, what is known, what is new, the method and the result.',
    template: { id: 'scientific', start: 'offer' },
  },
  technical: {
    id: 'technical',
    label: 'A technical guide',
    hint: 'Steps a practitioner will follow exactly; every term keeps one meaning.',
    genre: 'technical',
    checks: true,
    aids: ALL,
    review: 'editor',
  },
  business: {
    id: 'business',
    label: 'A business case',
    hint: 'Read for a decision-maker with ten minutes: the numbers, the recommendation, the risks.',
    genre: 'business',
    checks: true,
    aids: ALL,
    review: 'editor',
  },
  investment: {
    id: 'investment',
    label: 'An investment note',
    hint: 'Read for a portfolio manager: every figure held against the tables, no forecast stated as fact. Tickers carry a live price.',
    genre: 'investment',
    checks: true,
    aids: { ...ALL, tickers: true },
    review: 'editor',
  },
};

/** The picker's groups: ways of writing first, then kinds of piece. */
export const MODE_GROUPS: readonly (readonly [string, readonly ModeId[]])[] = [
  ['Ways of writing', ['article', 'clear', 'reflect', 'problem']],
  ['Kinds of piece', ['scientific', 'technical', 'business', 'investment']],
];

export const isModeId = (m: unknown): m is ModeId => typeof m === 'string' && (MODES as readonly string[]).includes(m);

/** The article's mode: named in the brief, else the mode of its genre, else an article. */
export function modeOf(brief?: Brief): Mode {
  if (isModeId(brief?.mode)) return MODE[brief.mode];
  if (isModeId(brief?.genre)) return MODE[brief.genre];
  return MODE.article;
}

/** The brief fields a mode sets; the genre rides along for anything that still reads only that. */
export const briefForMode = (id: ModeId): { mode: ModeId; genre: Genre } => ({ mode: id, genre: MODE[id].genre });

/** What `runChecks` should run for this article. */
export function checkOptions(brief?: Brief): { genre: Genre; sources: string; checks: boolean; style: boolean } {
  const mode = modeOf(brief);
  const genre = (GENRES as readonly string[]).includes(mode.genre) ? mode.genre : 'article';
  return { genre, sources: brief?.notes ?? '', checks: mode.checks, style: mode.aids.style };
}
