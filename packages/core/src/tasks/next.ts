// The next logical sentence — the one place Margin writes, one sentence at a
// time. First a verdict: has this paragraph made its point? Only if not, the
// one sentence that supplies the missing part. Ask only where
// `nextSentenceSpot` says it's worth it.

import {
  endsSentence,
  MAX_PARAGRAPH_SENTENCES,
  nextSentenceOk,
  paragraphLength,
  paragraphVerdict,
} from '../autocomplete.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { tidyCompletion } from '../tidy.ts';
import { field, type TaskOptions } from './common.ts';

export interface NextSentence {
  /** The paragraph has made its point: suggest nothing (the editor shows "¶ point made"). */
  complete: boolean;
  /** The paragraph's idea, in a few words, when the judge was asked. */
  idea?: string;
  /** What the paragraph was missing, when it was. */
  missing?: string;
  /** The suggested sentence, or '' for none. */
  next: string;
}

export async function nextSentence(
  llm: LLMClient,
  input: { title?: string; before: string; heading?: string; notes?: string[] },
  { signal }: TaskOptions = {},
): Promise<NextSentence> {
  const before = input.before.slice(-20_000);
  if (!endsSentence(before)) return { complete: false, next: '' }; // whole sentences only
  if (paragraphLength(before) >= MAX_PARAGRAPH_SENTENCES) return { complete: true, next: '' };
  const notes = (input.notes ?? []).slice(0, 12).map((n) => n.slice(0, 300));
  const model = await llm.modelFor('quick');
  const abort = signal ? { signal } : {};

  // First the judge — it only quotes; code decides whether the point is made.
  const judged = await llm.json({
    model,
    messages: P.judgeMessages({ before }),
    format: P.judgeSchema,
    maxTokens: 260,
    temperature: 0,
    ...abort,
  });
  const { complete, missing } = paragraphVerdict(before, judged);
  const idea = field(judged && typeof judged === 'object' ? (judged as Record<string, unknown>).idea : undefined, 200);
  if (complete) return { complete: true, idea, next: '' };

  // Then, only for an unfinished paragraph, the one sentence it's missing.
  let raw = '';
  const messages = P.completeMessages({
    title: input.title ?? '',
    before,
    heading: input.heading ?? '',
    notes,
    missing,
  });
  for await (const chunk of llm.stream({ model, messages, maxTokens: 70, temperature: 0.45, stop: ['\n\n'], ...abort }))
    raw += chunk;
  const next = tidyCompletion(raw, before);
  // A restatement, or the same opener again, isn't a step forward.
  return { complete: false, idea, missing, next: nextSentenceOk(before, next) ? next : '' };
}
