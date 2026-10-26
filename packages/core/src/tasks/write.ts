// Tasks that stream text: edits of the author's own passage, and answers
// about the draft. Clearpen never drafts the author's prose — for
// help with what to write, see `think`.

import { type Hunk, hunks } from '../diff.ts';
import { warning } from '../integrity.ts';
import type { LLMClient } from '../llm/client.ts';
import type { StreamInfo } from '../llm/types.ts';
import * as P from '../prompts.ts';
import { tidyRewrite, tidyText } from '../tidy.ts';
import { InputError, MAX_PASSAGE, type NoticeEvent, streamText, type TaskOptions, type TokenEvent } from './common.ts';

export interface TextDone {
  type: 'done';
  text: string;
  truncated: boolean;
}

export type TextEvent = NoticeEvent | TokenEvent | TextDone;

export interface RewriteInput {
  title?: string;
  text: string;
  /** A built-in action, or a free instruction. */
  action?: P.RewriteAction;
  instruction?: string;
  before?: string;
  after?: string;
}

export interface RewriteDone extends TextDone {
  /** The rewrite as pinpoint changes to `text`, each with its integrity warning. */
  changes: (Hunk & { warning: string })[];
}

/**
 * Rewrites a passage and returns both the new text and the few places that
 * actually changed — the editor shows only those, each accepted on its own.
 */
export async function* rewrite(
  llm: LLMClient,
  input: RewriteInput,
  opts: TaskOptions = {},
): AsyncGenerator<NoticeEvent | TokenEvent | RewriteDone> {
  const { text } = input;
  if (!text.trim()) throw new InputError('Nothing selected.');
  if (text.length > MAX_PASSAGE)
    throw new InputError('That selection is too long to rewrite in one go — try a section at a time.', 413);
  const instruction = (input.action && P.REWRITES[input.action]) || (input.instruction || '').trim();
  if (!instruction) throw new InputError('Say what to do with it.');
  const info: StreamInfo = {};
  const raw = yield* streamText(
    llm,
    P.rewriteMessages({ ...input, instruction }),
    { ...opts, maxTokens: Math.round(text.length / 1.5) + 400, temperature: 0.6 },
    info,
  );
  // Half a rewrite would silently delete the rest of the passage.
  if (info.truncated) throw new Error('That passage is too long to rewrite in one go — try a section at a time.');
  const out = tidyRewrite(raw, text);
  const changes = hunks(text, out).map((h) => ({ ...h, warning: warning(text.slice(h.from, h.to), h.insert) }));
  yield { type: 'done', text: out, truncated: false, changes };
}

/** Answers a question about the draft. */
export async function* ask(
  llm: LLMClient,
  input: { title?: string; content: string; question: string; history?: { role: string; content: string }[] },
  opts: TaskOptions = {},
): AsyncGenerator<TextEvent> {
  if (!input.question.trim()) throw new InputError('Ask something.');
  const info: StreamInfo = {};
  const raw = yield* streamText(llm, P.askMessages(input), { ...opts, maxTokens: 700, temperature: 0.5 }, info);
  yield { type: 'done', text: tidyText(raw), truncated: !!info.truncated };
}
