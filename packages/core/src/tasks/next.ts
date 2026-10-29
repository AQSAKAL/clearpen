// The next logical sentence — the one place Clearpen writes, one sentence at a
// time. First a verdict: has this paragraph made its point? Only if not, the
// one sentence that supplies the missing part, streamed as it's written so
// the writer sees it begin at once. Ask only where `nextSentenceSpot` says
// it's worth it, or when the writer asks with ⌘J. A lead-in ("Three
// reasons:") has nothing to judge: it gets what its colon introduces — and
// when that is a command ("use this CLI command:"), the command itself, as
// inline code, from a prompt that may name a standard tool; when it is an
// example ("Here are synthetic examples:"), the example itself, made up only
// when the author asks for a made-up one. A paragraph that so far only asks
// ("What can we see here?") gets its answer, read from the text before it.
// Any of them may draw on the passages of the writer's saved sources that
// bear on the paragraph (tasks/sources.ts).

import {
  CODE_LEAD_IN_MISSING,
  commandOk,
  copiesSecret,
  describesExample,
  EXAMPLE_LEAD_IN_MISSING,
  EXAMPLES_LEAD_IN_MISSING,
  echoes,
  endsCodeLeadIn,
  endsExampleLeadIn,
  endsLeadIn,
  endsQuestionLeadIn,
  endsSentence,
  LEAD_IN_MISSING,
  MAX_PARAGRAPH_SENTENCES,
  madeUpAboutReal,
  nextSentenceOk,
  notAQuery,
  paragraphLength,
  paragraphVerdict,
  QUESTION_LEAD_IN_MISSING,
} from '../autocomplete.ts';
import type { LLMClient } from '../llm/client.ts';
import { anySignal } from '../llm/util.ts';
import * as P from '../prompts.ts';
import {
  commandComplete,
  firstSentenceEnd,
  tidyCommand,
  tidyCommandCompletion,
  tidyCompletion,
  tidyList,
} from '../tidy.ts';
import type { TaskOptions } from './common.ts';
import { findPassages } from './sources.ts';

export interface NextSentenceInput {
  title?: string;
  /** The article up to the cursor. */
  before: string;
  /** The section being written, and the author's notes for it. */
  heading?: string;
  notes?: string[];
  /** What the writer has told Clearpen about the article, and the kind of piece it is. */
  brief?: P.Brief;
  /** The article's first paragraph of prose (`articleOpening`), however far the cursor is from it. */
  opening?: string;
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
  // One that introduces an example gets the example, not a description of one —
  // and one that promises several ("Generated examples:"), a short list of them.
  const example = leadIn && !command ? endsExampleLeadIn(before) : null;
  const list = !!example?.many;
  const madeUp = !!example?.madeUp;
  // A paragraph that only asks has no point for the judge to find yet: it gets its answer.
  const question = !leadIn && endsQuestionLeadIn(before);
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
  let missing = command
    ? CODE_LEAD_IN_MISSING
    : example
      ? list
        ? EXAMPLES_LEAD_IN_MISSING
        : EXAMPLE_LEAD_IN_MISSING
      : question
        ? QUESTION_LEAD_IN_MISSING
        : LEAD_IN_MISSING;
  if (!leadIn && !question) {
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
  // What the article is about, so a sentence reads the text as its subject does,
  // and what the writer's sources say about what it is writing.
  const passages = command
    ? []
    : await findPassages(llm, { sources: input.brief?.sources, before }, { model, ...(signal ? { signal } : {}) });
  const about = { brief: input.brief, opening: input.opening ?? '', passages };
  const messages = command
    ? P.commandMessages({ title, before, heading })
    : example
      ? P.exampleMessages({ title, before, heading, notes, ...about, lead: example })
      : question
        ? P.questionMessages({ title, before, heading, notes, ...about })
        : P.completeMessages({ title, before, heading, notes, missing, ...about });
  // A secret is as much the sources' as the article's: neither is copied into a suggestion.
  const saved = input.brief?.sources ?? [];
  const known = saved.length ? `${before}\n${saved.map((s) => s.markdown).join('\n')}` : before;
  // A list keeps only real, new examples — one that repeats the article, talks
  // about an example, or isn't the query it should be is never shown — and is
  // done when it has three.
  const keep = (item: string) =>
    !!item.trim() &&
    !echoes(before, item) &&
    !describesExample(item) &&
    !(example?.kind === 'query' && notAQuery(item));
  const listOf = (text: string) =>
    tidyList(text, 8)
      .split('\n')
      .filter(keep)
      .slice(0, 3)
      .map((item) => `\n${item}`)
      .join('');
  const tidy = command ? tidyCommandCompletion : list ? (r: string) => listOf(r) : tidyCompletion;
  // One sentence (or one line, or one short list) is all that's wanted: stop the model as soon as it's written.
  const written = (text: string) =>
    command
      ? commandComplete(text)
      : list
        ? listOf(text.slice(0, text.lastIndexOf('\n') + 1))
            .split('\n')
            .filter(Boolean).length >= 3
        : /\n/.test(text.trimStart()) || firstSentenceEnd(text.trimStart()) !== -1;
  const enough = new AbortController();
  let raw = '';
  let shown = '';
  try {
    for await (const chunk of llm.stream({
      model,
      messages,
      // An answer names hosts, flags and settings, an example names and figures: many tokens a word.
      maxTokens: list ? 320 : question || example ? 100 : 70,
      // A made-up example is better for some invention; a flag is right or wrong.
      temperature: command ? 0.2 : madeUp ? 0.6 : 0.45,
      // A list's items may come a blank line apart; anything else ends at one.
      stop: list ? ['\n\n\n'] : ['\n\n'],
      signal: anySignal([signal, enough.signal]),
    })) {
      raw += chunk;
      const text = tidy(raw, before);
      // A key or password copied out of the text is never shown, even for a moment.
      if (!command && copiesSecret(known, text)) break;
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
  // A restatement — of this paragraph, or of a sentence further up — or the
  // same opener again, isn't a step forward; prose where a command was asked
  // for isn't the command; made-up figures under a real company's name are a
  // claim about it. An answer to a question may reuse the text's details.
  const ok = command
    ? commandOk(tidyCommand(raw))
    : nextSentenceOk(before, next) &&
      !copiesSecret(known, next) &&
      // A list's items were each checked above; it stands if any are left.
      (question || list || !echoes(before, next)) &&
      !(example && !list && (describesExample(next) || (example.kind === 'query' && notAQuery(next)))) &&
      !(madeUp && madeUpAboutReal(before, next));
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
