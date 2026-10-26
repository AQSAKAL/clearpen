// How an AI change becomes suggestions in the editor: only the spots that
// differ, each with a warning when it touches a figure, a name or code. Every
// app marks changes the same way, so this lives in the engine.

import { type Hunk, hunks } from './diff.ts';
import { inventions, warning } from './integrity.ts';
import { PREAMBLE_RE } from './tidy.ts';

export interface Change extends Hunk {
  /** Empty, or what to check before accepting: a figure changed, dropped or found nowhere in the sources. */
  warning: string;
}

/**
 * A rewrite that is one change over most of the passage reads better as a
 * single suggestion than as one huge marked span.
 */
export function isWholeRewrite(text: string, changes: Hunk[]): boolean {
  const [only] = changes;
  return changes.length === 1 && !!only && only.to - only.from > text.length * 0.8;
}

/**
 * One edit from the model as suggestions. A long replacement is split again,
 * so only the words that differ are marked; figures the edit brings in that
 * appear nowhere in `sources` (the draft and the writer's notes) are flagged.
 */
export function editChanges(text: string, edit: Hunk, sources: string): Change[] {
  const old = text.slice(edit.from, edit.to);
  const parts =
    old.length > 80 && edit.insert.length > 40
      ? hunks(old, edit.insert).map((h) => ({ from: edit.from + h.from, to: edit.from + h.to, insert: h.insert }))
      : [edit];
  return parts.map((h) => {
    const invented = inventions(h.insert, sources);
    return {
      ...h,
      warning:
        warning(text.slice(h.from, h.to), h.insert) ||
        (invented.length ? `unverified: ${invented.slice(0, 3).join(', ')}` : ''),
    };
  });
}

/**
 * What to show while a rewrite streams in: the model's text so far, without a
 * "Here's the revised passage:" preamble, starting with the passage's own
 * leading space.
 */
export function streamingRewrite(raw: string, original: string): string {
  const body = raw.replace(/^\s+/, '');
  const shown = PREAMBLE_RE.test(original.trim()) ? body : body.replace(PREAMBLE_RE, '');
  return (original.match(/^\s*/)?.[0] ?? '') + shown;
}
