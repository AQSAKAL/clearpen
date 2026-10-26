// Tasks that answer with prose: autocomplete, rewrites, continuing, drafting
// a section, and answering questions about the draft.

import { type Hunk, hunks } from '../diff.ts';
import { warning } from '../integrity.ts';
import type { LLMClient } from '../llm/client.ts';
import type { StreamInfo } from '../llm/types.ts';
import * as P from '../prompts.ts';
import { tidyCompletion, tidyRewrite, tidySectionBody, tidyText } from '../tidy.ts';
import { InputError, MAX_PASSAGE, type NoticeEvent, streamText, type TaskOptions, type TokenEvent } from './common.ts';

export interface TextDone {
  type: 'done';
  text: string;
  truncated: boolean;
}

export type TextEvent = NoticeEvent | TokenEvent | TextDone;

/** Autocomplete: the rest of the sentence at the cursor, or nothing. */
export async function* complete(
  llm: LLMClient,
  input: { title?: string; before: string; after?: string },
  opts: TaskOptions = {},
): AsyncGenerator<TextEvent> {
  const info: StreamInfo = {};
  const raw = yield* streamText(
    llm,
    P.completeMessages(input),
    { ...opts, maxTokens: 48, temperature: 0.45, stop: ['\n\n'] },
    info,
  );
  yield { type: 'done', text: tidyCompletion(raw, input.before), truncated: !!info.truncated };
}

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

/** Writes the next paragraph or two, in the author's voice. */
export async function* continueWriting(
  llm: LLMClient,
  input: { title?: string; before: string; after?: string; brief?: P.Brief; instruction?: string; useWriter?: boolean },
  opts: TaskOptions & { firstWordMs?: number } = {},
): AsyncGenerator<TextEvent> {
  const info: StreamInfo = {};
  const raw = yield* streamText(
    llm,
    P.continueMessages(input),
    { ...opts, role: input.useWriter ? 'writer' : 'quick', maxTokens: 500, temperature: 0.75 },
    info,
  );
  yield { type: 'done', text: tidyText(raw), truncated: !!info.truncated };
}

/** Drafts one section of the outline with the writer model. */
export async function* draft(
  llm: LLMClient,
  input: P.DraftInput,
  opts: TaskOptions & { firstWordMs?: number } = {},
): AsyncGenerator<TextEvent> {
  if (!input.outline.sections[input.index]) throw new InputError('No such section in the outline.');
  const info: StreamInfo = {};
  const raw = yield* streamText(
    llm,
    P.draftMessages(input),
    { ...opts, role: 'writer', maxTokens: 1400, temperature: 0.75 },
    info,
  );
  yield { type: 'done', text: input.inPlace ? tidySectionBody(raw) : tidyText(raw), truncated: !!info.truncated };
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
