// Tasks that stream text: edits of the author's own passage, and answers
// about the draft. Clearpen never drafts the author's prose — for
// help with what to write, see `think`.

import { applyHunks, type Hunk, hunks } from '../diff.ts';
import { warning } from '../integrity.ts';
import type { LLMClient } from '../llm/client.ts';
import type { StreamInfo } from '../llm/types.ts';
import * as P from '../prompts.ts';
import { tidyRewrite, tidyText } from '../tidy.ts';
import { voiceWarnings } from '../voice.ts';
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
  /** The rewrite as pinpoint changes to `text`, each with what to check before accepting: a figure changed, a paragraph's last sentence cut. */
  changes: (Hunk & { warning: string })[];
  /**
   * Changes held back because they would flatten the author's voice — a
   * question made a statement, a contraction expanded, a hedge cut — one
   * reason each. `text` is the rewrite without them.
   */
  dropped: string[];
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
  const all = hunks(text, out);
  // Simplify and Shorten change words, not voice: a change that would is held back.
  const voice = voiceWarnings(text, out, input.action, all);
  const changes: RewriteDone['changes'] = [];
  const dropped: string[] = [];
  all.forEach((h, i) => {
    const v = voice[i]!;
    if (v.drop) {
      dropped.push(v.drop);
      return;
    }
    const facts = warning(text.slice(h.from, h.to), h.insert);
    const warn = facts ? (v.warning ? `${facts}; ${v.warning}` : facts) : v.warning ? `Check: ${v.warning}` : '';
    changes.push({ ...h, warning: warn });
  });
  yield { type: 'done', text: dropped.length ? applyHunks(text, changes) : out, truncated: false, changes, dropped };
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
