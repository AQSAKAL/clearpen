// Margin notes — the review's notes, a check's verdicts, Clearpen's own
// findings — stay pinned to the passage they're about while the writer edits.

import { blocks, sentences } from './analysis.ts';
import type { Span } from './anchor.ts';
import type { Category, Finding } from './checks.ts';
import type { Lens } from './intent.ts';

/** The categories of Clearpen's own findings each check lens shows first. */
export const LENS_CATEGORIES: Record<Lens, Category[]> = {
  factcheck: ['factcheck', 'numbers'],
  logic: ['logic'],
  consistency: ['consistency', 'numbers'],
  clarity: ['clarity', 'structure', 'concision', 'style'],
};

/** Findings of `categories` that touch [from, to). */
export const findingsIn = (findings: Finding[], from: number, to: number, categories: readonly string[]): Finding[] =>
  findings.filter((f) => f.from < to && f.to > from && categories.includes(f.category));

// ─────────────────────────────────────────────────────────── the point-made gate
//
// Sentence polish on a paragraph that has not yet made its point is wasted:
// those sentences change once the paragraph does its job (research 2.10 —
// Hobbs's three levels, Hayes, Eisenberg's triage). The cheapest sound way to
// honour that: the review's one model call is asked, before it writes any
// note, which paragraphs have not yet made their point — a short JSON list,
// by paragraph number, with what each is missing — so the verdict costs no
// extra call and a few output tokens. The judge names paragraphs by number
// from a list code builds (as the next-sentence judge names sentences by
// number): a number can't be paraphrased, and code decides what it means.
// Code then holds back the sentence-level notes on those paragraphs —
// Clearpen's own style findings and the model's clarity, concision and style
// notes — and leaves one note on the paragraph saying what is missing, with
// the held notes collapsed under it for the writer to open. Exact checks
// (numbers, consistency, evidence, facts, logic) and structure notes are never
// held: a wrong figure is wrong whatever the paragraph does.

/** The categories that are sentence polish, and so wait for the paragraph's point. */
export const SENTENCE_LEVEL: readonly string[] = ['clarity', 'concision', 'style'];

/** A paragraph the review judged not to have made its point yet. */
export interface Unfinished extends Span {
  /** What it still needs, in the model's words: "a reason to believe the claim". */
  missing: string;
}

/** Whether a note is held back: sentence-level, on a paragraph that has not yet made its point. */
export const heldBack = (unfinished: readonly Span[], note: Span & { category: string }): boolean =>
  SENTENCE_LEVEL.includes(note.category) && unfinished.some((p) => note.from < p.to && note.to > p.from);

export interface JudgedParagraph extends Span {
  /** Its opening words, to name it to the model. */
  opening: string;
}

/**
 * The prose paragraphs the review judges, in order, numbered from 1 in the
 * prompt: two sentences or more. A heading, a list item, a table, code or a
 * one-sentence beat has no point of its own to make.
 */
export function judgedParagraphs(text: string): JudgedParagraph[] {
  const S = sentences(text);
  const out: JudgedParagraph[] = [];
  let i = 0;
  for (const b of blocks(text)) {
    const own: typeof S = [];
    while (i < S.length && S[i]!.from < b.to) {
      if (S[i]!.from >= b.from) own.push(S[i]!);
      i++;
    }
    if (b.heading || b.list || own.length < 2) continue;
    const first = own[0]!.text;
    out.push({ from: own[0]!.from, to: own.at(-1)!.to, opening: first.length > 72 ? `${first.slice(0, 71)}…` : first });
  }
  return out;
}

/**
 * Where a passage found in `snapshot` is in the text now: the copy of its
 * words nearest to where it was, or null when they're gone.
 */
export function relocate(span: Span, snapshot: string, current: string): Span | null {
  if (snapshot === current) return { from: span.from, to: span.to };
  const quote = snapshot.slice(span.from, span.to);
  if (!quote) return null;
  let best = -1;
  for (let i = current.indexOf(quote); i !== -1; i = current.indexOf(quote, i + 1)) {
    if (best === -1 || Math.abs(i - span.from) < Math.abs(best - span.from)) best = i;
  }
  return best === -1 ? null : { from: best, to: best + quote.length };
}
