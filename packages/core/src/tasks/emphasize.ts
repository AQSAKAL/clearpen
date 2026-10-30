import { anchorNotes } from '../anchor.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import type { TaskOptions } from './common.ts';

export type EmphasisKind = 'bold' | 'italic' | 'underline';

export interface EmphasisSpan {
  from: number;
  to: number;
  kind: EmphasisKind;
  /** The words as they appear in the passage, for the mark to wrap. */
  text: string;
}

export interface EmphasisResult {
  spans: EmphasisSpan[];
}

const KINDS: EmphasisKind[] = ['bold', 'italic', 'underline'];

/** The line a position sits on. */
function lineAt(text: string, pos: number): string {
  const start = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const end = text.indexOf('\n', pos);
  return text.slice(start, end === -1 ? text.length : end);
}

/** Whether a span is emphasis we want: words on a running line, not a heading or a label. */
function usable(text: string, from: number, to: number): boolean {
  const phrase = text.slice(from, to);
  if (!phrase.trim() || phrase.includes('\n')) return false;
  if (phrase.trim().split(/\s+/).length > 14) return false;
  const line = lineAt(text, from);
  // A heading, a setext underline, or a whole line that is just a label.
  if (/^\s{0,3}#{1,6}\s/.test(line)) return false;
  if (/^\s*(=+|-+)\s*$/.test(line)) return false;
  if (line.trim().startsWith('>') || /^\s*([-*+]|\d+\.)\s/.test(line)) return false;
  return true;
}

/**
 * What in a passage carries importance, significance or consequence — as
 * spans, never as rewritten text. The model only names the words; the app
 * adds the marks, so not a word is changed and no line is added.
 */
export async function emphasize(
  llm: LLMClient,
  input: { title?: string; text: string; before?: string; after?: string },
  { signal }: TaskOptions = {},
): Promise<EmphasisResult> {
  const text = String(input.text ?? '');
  if (!text.trim()) return { spans: [] };

  const model = await llm.modelFor('quick');
  const out = await llm.json({
    model,
    messages: P.emphasizeMessages({ title: input.title, text, before: input.before, after: input.after }),
    format: P.emphasizeSchema,
    maxTokens: 400,
    temperature: 0,
    ...(signal ? { signal } : {}),
  });

  const raw = out && typeof out === 'object' ? (out as { emphasis?: unknown }).emphasis : undefined;
  const notes = (Array.isArray(raw) ? raw : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const { anchor, kind } = item as { anchor?: unknown; kind?: unknown };
      const quote = typeof anchor === 'string' ? anchor.trim() : '';
      if (quote.length < 3 || !KINDS.includes(kind as EmphasisKind)) return null;
      return { quote, kind: kind as EmphasisKind };
    })
    .filter((n): n is { quote: string; kind: EmphasisKind } => n !== null);

  const placed = anchorNotes(text, notes).slice(0, 8);
  return {
    spans: placed
      .filter((p) => usable(text, p.from, p.to))
      .map((p) => ({ from: p.from, to: p.to, kind: p.kind, text: text.slice(p.from, p.to) })),
  };
}
