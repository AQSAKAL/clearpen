// What a Simplify or Shorten must leave alone. Chapin, reading Graham: what
// makes a plain passage work is not the plainness but the texture — a word
// the next sentence picks up, a question, the author's own mix of
// contractions, a hedge that says how sure they are, the sentence a paragraph
// lands on, a long sentence followed by a short one. A mechanical simplify
// removes exactly these, because each looks like a rule broken, and leaves
// every sentence the same weight.
//
// So the diff is checked by code before the changes are shown. A change that
// undoes one of them — a question made a statement, a contraction expanded
// or made, a hedge cut, the pivot word cut — is dropped and never reaches
// the editor; one that only evens out the rhythm or cuts a paragraph's last
// sentence reaches it with a warning. The voice is preserved, never judged:
// Improve and the tone actions, where the author asked for a change of
// voice, are not guarded, and no model is asked.

import { blocks, type Sentence, sentences } from './analysis.ts';
import { type Hunk, hunks } from './diff.ts';
import type { RewriteAction } from './prompts.ts';
import { contentStems, stem } from './style.ts';

export interface VoiceVerdict {
  /** Why the change never reaches the editor — it undoes something the author did on purpose — or ''. */
  drop: string;
  /** What to check before accepting — the rhythm evened out, a paragraph's last sentence cut — or ''. */
  warning: string;
}

/** The actions the guard applies to: the ones meant to change words, not voice. */
export const GUARDED_ACTIONS: ReadonlySet<RewriteAction> = new Set<RewriteAction>(['simplify', 'shorten']);

// ─────────────────────────────────────────────────────────── words

const q = (s: string) => `“${s}”`;
const blank = (m: string) => ' '.repeat(m.length);

/** Prose only: inline code, link targets and URLs blanked, every position kept. */
const prose = (s: string) =>
  s
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\]\([^)\s]*\)/g, (m) => `]${' '.repeat(m.length - 1)}`)
    .replace(/\b(?:https?:\/\/|www\.)\S+/g, blank);

const WORD = /[\p{L}\p{N}’']+/gu;

interface Word {
  word: string;
  lower: string;
  from: number;
  to: number;
}

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = m[0].replace(/^[’']+|[’']+$/g, '');
    if (!word) continue;
    const from = m.index + m[0].indexOf(word);
    out.push({ word, lower: word.toLowerCase(), from, to: from + word.length });
  }
  return out;
}

/** The content words of a stretch of text by stem, each with the word as the author wrote it. */
function stemsOf(text: string): Map<string, string> {
  const list = words(prose(text));
  const content = contentStems(list);
  const out = new Map<string, string>();
  for (const w of list) {
    const s = stem(w.lower);
    if (w.lower.length > 2 && content.has(s) && !out.has(s)) out.set(s, w.word);
  }
  return out;
}

const found = (re: RegExp, s: string): string[] => [...s.matchAll(re)].map((m) => m[0]);
const norm = (s: string) => s.toLowerCase().replace(/’/g, "'");
/** The entries of `a` that `b` doesn't have, apostrophes and case aside. */
const diff = (a: string[], b: string[]): string[] => {
  const have = new Set(b.map(norm));
  return a.filter((x) => !have.has(norm(x)));
};

const questions = (s: string) => (prose(s).match(/\?/g) ?? []).length;
const sentenceEnds = (s: string) => (prose(s).match(/[.!?…]+(?=\s|$)/g) ?? []).length;
const wordCount = (s: string) => words(prose(s)).length;

// "don't", "it's", "we've", "I'm" — a possessive "'s" ("the team's") is not one, so "'s" counts only on a pronoun.
const CONTRACTION =
  /\b(?:(?:it|he|she|that|there|what|who|here|where|how|let)(?:’|')s|\p{L}+n(?:’|')t|\p{L}+(?:’|')(?:re|ve|ll|d|m))\b/giu;
// What those contract: the forms a model writes when it "fixes" one.
const EXPANSION =
  /\b(?:(?:do|does|did|is|are|was|were|has|have|had|will|would|could|should|must|need|can) not|cannot|(?:it|he|she|that|there|what|who|here|where|how) is|(?:it|there|he|she|who) has|let us|(?:we|you|they) are|(?:i|we|you|they|would|could|should|might|must) have|(?:i|we|you|they|he|she|it) will|(?:i|we|you|they|he|she|it) would|(?:i|we|you|they|he|she|it) had|i am)\b/gi;

// Hedges that carry information: how sure the author is, and what their
// certainty rests on. A habitual "perhaps" or "a bit" is not here — the
// `confident` action may cut those, and says why.
const HEDGE =
  /\b(?:i think|i believe|i suspect|i guess|i(?:’|')d guess|i(?:’|')d say|i don(?:’|')t think|i do not think|i(?:’|')m not sure|i am not sure|we(?:’|')re not sure|we are not sure|not sure|we think|we believe|we suspect|in my experience|in our experience|in (?:my|our) tests?|in practice|so far|as far as (?:i|we) (?:can tell|know)|probably|most likely|likely|i(?:’|')ve found|we(?:’|')ve found|i(?:’|')m told|for what it(?:’|')s worth)\b/gi;

// ─────────────────────────────────────────────────────────── where the original went

const grow = (h: Hunk) => h.insert.length - (h.to - h.from);

/** Where a position of the original lands in the result; inside a change, the start of its replacement. */
function mapStart(sorted: Hunk[], p: number): number {
  let d = 0;
  for (const h of sorted) {
    if (h.from < p && h.to <= p) d += grow(h);
    else if (h.from <= p && p < h.to) return h.from + d;
    else break;
  }
  return p + d;
}

/** The same for a span's end; at or inside a change, the end of its replacement. */
function mapEnd(sorted: Hunk[], p: number): number {
  let d = 0;
  for (const h of sorted) {
    if (h.to < p) d += grow(h);
    else if (h.from < p && p <= h.to) return h.from + d + h.insert.length;
    else break;
  }
  return p + d;
}

const overlapping = (S: Sentence[], from: number, to: number): Sentence[] =>
  S.filter((s) => s.from < to && s.to > from);

/** The original sentences a change touches — or, in the gap between two, the one before. */
function touched(S: Sentence[], h: Hunk): Sentence[] {
  const list = overlapping(S, h.from, Math.max(h.to, h.from + 1));
  if (list.length) return list;
  const prev = S.filter((s) => s.to <= h.from).at(-1);
  return prev ? [prev] : [];
}

// ─────────────────────────────────────────────────────────── the checks

/**
 * The pivots of each sentence: a content word it shares with the sentence
 * before or after, which is how Graham's paragraphs hold together. The
 * passage's subject — a word in most of its sentences — is not a pivot;
 * cutting one mention of it is fair game.
 */
function pivotsOf(stems: Map<string, string>[]): Map<string, number[]>[] {
  const n = stems.length;
  const inSentences = new Map<string, number>();
  for (const m of stems) for (const s of m.keys()) inSentences.set(s, (inSentences.get(s) ?? 0) + 1);
  const topic = (s: string) => {
    const c = inSentences.get(s) ?? 0;
    return c >= 3 && c * 2 > n;
  };
  return stems.map((m, i) => {
    const out = new Map<string, number[]>();
    for (const s of m.keys()) {
      if (topic(s)) continue;
      const shared = [i - 1, i + 1].filter((j) => j >= 0 && j < n && stems[j]!.has(s));
      if (shared.length) out.set(s, shared);
    }
    return out;
  });
}

function questionLost(before: string, after: string, T: Sentence[], now: string): string {
  if (questions(before) <= questions(after)) return '';
  const had = T.reduce((n, s) => n + questions(s.masked), 0);
  return questions(now) < had ? 'turns your question into a statement' : '';
}

function contractionChanged(before: string, after: string): string {
  const cb = found(CONTRACTION, before);
  const ca = found(CONTRACTION, after);
  const eb = found(EXPANSION, before);
  const ea = found(EXPANSION, after);
  const expanded = diff(cb, ca)[0];
  if (expanded && diff(ea, eb).length) return `expands ${q(expanded)}`;
  const contracted = diff(ca, cb)[0];
  const was = diff(eb, ea)[0];
  return contracted && was ? `contracts ${q(was)}` : '';
}

function hedgeCut(before: string, after: string, now: string): string {
  const still = norm(now);
  const cut = diff(found(HEDGE, before), found(HEDGE, after)).find((h) => !still.includes(norm(h)));
  return cut ? `cuts the hedge ${q(cut)}` : '';
}

function pivotCut(
  before: string,
  after: string,
  at: number[],
  stems0: Map<string, string>[],
  stems1: Map<string, string>[],
  pivots: Map<string, number[]>[],
): string {
  const lost = stemsOf(before);
  const kept = stemsOf(after);
  for (const i of at) {
    for (const [s, word] of lost) {
      if (kept.has(s) || stems1[i]!.has(s)) continue;
      for (const j of pivots[i]!.get(s) ?? []) {
        // The same swap on both sides keeps the pickup: "utilise … utilise" → "use … use".
        const renamed =
          !stems1[j]!.has(s) &&
          [...stems1[i]!.keys()].some((x) => stems1[j]!.has(x) && !stems0[i]!.has(x) && !stems0[j]!.has(x));
        if (!renamed)
          return `cuts ${q(word)}, ${j > i ? 'which your next sentence picks up' : 'picked up from the sentence before'}`;
      }
    }
  }
  return '';
}

/** The last sentence of each prose paragraph — where the meaning usually lands. */
function lastSentences(text: string, S: Sentence[]): Sentence[] {
  const out: Sentence[] = [];
  for (const b of blocks(text)) {
    if (b.heading || b.list) continue;
    const last = S.filter((s) => s.from >= b.from && s.to <= b.to).at(-1);
    if (last) out.push(last);
  }
  return out;
}

/** Fewer than half the sentence's words are in what replaces it: cut, not merged into its neighbour. */
function mostlyGone(L: Sentence, after: string): boolean {
  const had = new Set(words(L.masked).map((w) => w.lower));
  if (!had.size) return false;
  const now = new Set(words(prose(after)).map((w) => w.lower));
  let kept = 0;
  for (const w of had) if (now.has(w)) kept++;
  return kept * 2 < had.size;
}

/** The standard deviation of sentence length, in words. */
function spread(S: Sentence[]): number {
  const lens = S.map((s) => words(s.masked).length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
}

/** A long sentence followed by a four-word one is rhythm, not an error: the result must keep at least half of it. */
const flattens = (S0: Sentence[], S1: Sentence[]): boolean =>
  S0.length >= 3 && S1.length >= 1 && spread(S0) > 0 && spread(S1) < spread(S0) / 2;

/** A change that makes a sentence longer or shorter, or joins or splits sentences. */
const reshapes = (before: string, after: string) =>
  wordCount(before) !== wordCount(after) || sentenceEnds(before) !== sentenceEnds(after);

// ─────────────────────────────────────────────────────────── entry point

/**
 * One verdict per change of `changes` (the pinpoint hunks from `original`
 * to `result`, in the same order): a reason to drop it, a warning to carry,
 * or neither. Only Simplify and Shorten are guarded; for any other action
 * every change passes.
 */
export function voiceWarnings(
  original: string,
  result: string,
  action?: RewriteAction,
  changes: Hunk[] = hunks(original, result),
): VoiceVerdict[] {
  if (!action || !GUARDED_ACTIONS.has(action) || !changes.length) return changes.map(() => ({ drop: '', warning: '' }));
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  const S0 = sentences(original);
  const S1 = sentences(result);
  const stems0 = S0.map((s) => stemsOf(s.masked));
  // Each original sentence as it reads in the result — '' when it is gone.
  const landed = S0.map((s) =>
    overlapping(S1, mapStart(sorted, s.from), mapEnd(sorted, s.to))
      .map((r) => r.masked)
      .join(' '),
  );
  const stems1 = landed.map(stemsOf);
  const pivots = pivotsOf(stems0);
  const lasts = lastSentences(original, S0);
  // The rhythm is a property of the whole edit; the warning goes on the changes that reshape sentences.
  let rhythm: Hunk[] = flattens(S0, S1) ? sorted.filter((h) => reshapes(original.slice(h.from, h.to), h.insert)) : [];
  if (flattens(S0, S1) && !rhythm.length) rhythm = sorted;

  const verdicts = new Map<Hunk, VoiceVerdict>();
  for (const h of sorted) {
    const before = original.slice(h.from, h.to);
    const T = touched(S0, h);
    const at = T.map((s) => S0.indexOf(s));
    const now = at.map((i) => landed[i]!).join(' ');
    const drop =
      questionLost(before, h.insert, T, now) ||
      contractionChanged(before, h.insert) ||
      hedgeCut(before, h.insert, now) ||
      pivotCut(before, h.insert, at, stems0, stems1, pivots);
    const warnings: string[] = [];
    if (lasts.some((L) => h.from <= L.from && h.to >= L.to && mostlyGone(L, h.insert)))
      warnings.push('cuts the last sentence of your paragraph, where its point usually lands');
    if (rhythm.includes(h)) warnings.push('evens out your sentence lengths');
    verdicts.set(h, { drop, warning: drop ? '' : warnings.join('; ') });
  }
  return changes.map((h) => verdicts.get(h) ?? { drop: '', warning: '' });
}
