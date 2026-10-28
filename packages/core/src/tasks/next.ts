// The next logical sentence — the one place Clearpen writes, one sentence at a
// time. First a verdict: has this paragraph made its point? Only if not, the
// one sentence that supplies the missing part, streamed as it's written so
// the writer sees it begin at once. Ask only where `nextSentenceSpot` says
// it's worth it, or when the writer asks with ⌘J. A lead-in ("Three
// reasons:") has nothing to judge: it gets what its colon introduces — and
// when that is a command ("use this CLI command:"), the command itself, as
// inline code, from a prompt that may name a standard tool.

import {
  CODE_LEAD_IN_MISSING,
  commandOk,
  endsCodeLeadIn,
  endsLeadIn,
  endsSentence,
  LEAD_IN_MISSING,
  MAX_PARAGRAPH_SENTENCES,
  nextSentenceOk,
  paragraphLength,
  paragraphVerdict,
} from '../autocomplete.ts';
import type { LLMClient } from '../llm/client.ts';
import { anySignal } from '../llm/util.ts';
import * as P from '../prompts.ts';
import { commandComplete, firstSentenceEnd, tidyCommand, tidyCommandCompletion, tidyCompletion } from '../tidy.ts';
import type { TaskOptions } from './common.ts';

export interface NextSentenceInput {
  title?: string;
  /** The article up to the cursor. */
  before: string;
  /** The section being written, and the author's notes for it. */
  heading?: string;
  notes?: string[];
}

export interface NextSentence {
  /** The paragraph has made its point: suggest nothing (the editor shows "¶ point made"). */
  complete: boolean;
  /** What the paragraph was missing, when it was. */
  missing?: string;
  /** The suggested sentence, or '' for none. */
  next: string;
}

export type NextSentenceEvent =
  /** The judge's verdict, before any sentence is written. */
  | { type: 'verdict'; complete: boolean; missing?: string }
  /** The sentence so far, tidied to fit at the cursor. */
  | { type: 'text'; text: string }
  /** The finished sentence — or '' when it only repeated what's there. */
  | { type: 'done'; next: string };

export async function* nextSentenceStream(
  llm: LLMClient,
  input: NextSentenceInput,
  { signal }: TaskOptions = {},
): AsyncGenerator<NextSentenceEvent> {
  const before = input.before.slice(-20_000);
  const leadIn = endsLeadIn(before);
  // A lead-in that introduces a command gets the command, not a sentence.
  const command = leadIn && endsCodeLeadIn(before);
  // Whole sentences only, and a long paragraph has said enough.
  if (!leadIn && !endsSentence(before)) {
    yield { type: 'done', next: '' };
    return;
  }
  if (!leadIn && paragraphLength(before) >= MAX_PARAGRAPH_SENTENCES) {
    yield { type: 'verdict', complete: true };
    yield { type: 'done', next: '' };
    return;
  }
  const notes = (input.notes ?? []).slice(0, 12).map((n) => n.slice(0, 300));
  const model = await llm.modelFor('quick');

  // First the judge — it only names sentences; code decides whether the point is made.
  let missing = command ? CODE_LEAD_IN_MISSING : LEAD_IN_MISSING;
  if (!leadIn) {
    const judged = await llm.json({
      model,
      messages: P.judgeMessages({ before }),
      format: P.judgeSchema,
      maxTokens: 60,
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    const verdict = paragraphVerdict(before, judged);
    if (verdict.complete) {
      yield { type: 'verdict', complete: true };
      yield { type: 'done', next: '' };
      return;
    }
    missing = verdict.missing;
  }
  yield { type: 'verdict', complete: false, missing };

  // Then, only for an unfinished paragraph, the one sentence it's missing —
  // or, after a command lead-in, the one command, held to a low temperature
  // because a flag is right or wrong.
  const title = input.title ?? '';
  const heading = input.heading ?? '';
  const messages = command
    ? P.commandMessages({ title, before, heading })
    : P.completeMessages({ title, before, heading, notes, missing });
  const tidy = command ? tidyCommandCompletion : tidyCompletion;
  // One sentence (or one line) is all that's wanted: stop the model as soon as it's written.
  const written = (text: string) =>
    command ? commandComplete(text) : /\n/.test(text.trimStart()) || firstSentenceEnd(text.trimStart()) !== -1;
  const enough = new AbortController();
  let raw = '';
  let shown = '';
  try {
    for await (const chunk of llm.stream({
      model,
      messages,
      maxTokens: 70,
      temperature: command ? 0.2 : 0.45,
      stop: ['\n\n'],
      signal: anySignal([signal, enough.signal]),
    })) {
      raw += chunk;
      const text = tidy(raw, before);
      if (text.trim() && text !== shown) {
        shown = text;
        yield { type: 'text', text };
      }
      if (written(raw)) break;
    }
  } finally {
    enough.abort();
  }
  const next = tidy(raw, before);
  // A restatement, or the same opener again, isn't a step forward; prose
  // where a command was asked for isn't the command.
  const ok = command ? commandOk(tidyCommand(raw)) : nextSentenceOk(before, next);
  yield { type: 'done', next: ok ? next : '' };
}

/** The verdict and the sentence together, for callers that don't stream. */
export async function nextSentence(
  llm: LLMClient,
  input: NextSentenceInput,
  opts: TaskOptions = {},
): Promise<NextSentence> {
  const out: NextSentence = { complete: false, next: '' };
  for await (const ev of nextSentenceStream(llm, input, opts)) {
    if (ev.type === 'verdict') {
      out.complete = ev.complete;
      if (ev.missing) out.missing = ev.missing;
    } else if (ev.type === 'done') out.next = ev.next;
  }
  return out;
}
