// Margin notes — the review's notes, a check's verdicts, Clearpen's own
// findings — stay pinned to the passage they're about while the writer edits.

import type { Span } from './anchor.ts';
import type { Category, Finding } from './checks.ts';
import type { Lens } from './intent.ts';

/** The categories of Clearpen's own findings each check lens shows first. */
export const LENS_CATEGORIES: Record<Lens, Category[]> = {
  factcheck: ['factcheck', 'numbers'],
  logic: ['logic'],
  consistency: ['consistency', 'numbers'],
};

/** Findings of `categories` that touch [from, to). */
export const findingsIn = (findings: Finding[], from: number, to: number, categories: readonly string[]): Finding[] =>
  findings.filter((f) => f.from < to && f.to > from && categories.includes(f.category));

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
