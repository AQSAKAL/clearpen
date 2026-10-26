// Pinpoint edits: a model's "insert this before that sentence" or "replace
// these words" turned into an exact change to the passage.

import { findQuote } from './anchor.ts';
import type { Hunk } from './diff.ts';

export type EditType = 'insert_before' | 'insert_after' | 'replace' | 'delete';

export interface ModelEdit {
  type: EditType | string;
  /** Exact words from the passage the edit is anchored to. */
  anchor: string;
  text: string;
}

const BLOCK = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)|\n/;

/**
 * Turns one model edit into a change to `text`, or null when its anchor isn't
 * in the passage. Blocks (headings, lists, new paragraphs) go on their own
 * lines; words go inline.
 */
export function placeEdit(text: string, edit: ModelEdit): Hunk | null {
  const at = findQuote(text, String(edit.anchor || ''));
  if (!at) return null;
  const add = String(edit.text ?? '').trim();
  const lineStart = text.lastIndexOf('\n', at.from - 1) + 1;
  const nextBreak = text.indexOf('\n', at.to);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const block = BLOCK.test(add);
  switch (edit.type) {
    case 'replace':
      return { from: at.from, to: at.to, insert: String(edit.text ?? '') };
    case 'delete': {
      // Take one neighbouring space with the words, so no double space is left.
      const to = text[at.to] === ' ' ? at.to + 1 : at.to;
      const from = to === at.to && text[at.from - 1] === ' ' ? at.from - 1 : at.from;
      return { from, to, insert: '' };
    }
    case 'insert_before':
      return block || at.from === lineStart
        ? { from: lineStart, to: lineStart, insert: `${add}\n\n` }
        : { from: at.from, to: at.from, insert: `${add} ` };
    case 'insert_after':
      // A heading introduces what follows; after the last paragraph it must have meant before.
      if (/^#{1,6}\s/.test(add) && !text.slice(lineEnd).trim())
        return { from: lineStart, to: lineStart, insert: `${add}\n\n` };
      return block || at.to === lineEnd
        ? { from: lineEnd, to: lineEnd, insert: `\n\n${add}` }
        : { from: at.to, to: at.to, insert: ` ${add}` };
    default:
      return null;
  }
}
