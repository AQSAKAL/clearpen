// Guided writing: after the author fills a frame, Clearpen says what the
// sentence still leaves unsaid and asks the next frame's question. Code
// decides whether the frame is filled; for a one-paragraph template the
// paragraph judge (the same one the next sentence uses) says what the
// paragraph is still missing; the coach asks. Nothing here writes a word of
// the piece: a reply that is not a question is dropped.

import { paragraphVerdict } from '../autocomplete.ts';
import {
  type Frame,
  frameFilled,
  guideReplyOk,
  isTemplateId,
  lastSentence,
  TEMPLATES,
  type TemplateId,
} from '../guide.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { field, InputError, type TaskOptions } from './common.ts';

export interface GuideInput {
  template: TemplateId;
  /** The frame the author has been filling, as an index into the template's frames. */
  step: number;
  /** The article up to the cursor. */
  before: string;
  title?: string;
  brief?: P.Brief;
}

export interface GuideReply {
  /** Whether the author's last sentence filled the frame; when not, nothing was asked. */
  filled: boolean;
  /** One question about what the sentence leaves unsaid, or ''. */
  missing: string;
  /** The next frame's question in the coach's words, or '' (the frame's own question will do). */
  next: string;
  /** For a one-paragraph template: the judge found the paragraph complete. */
  complete: boolean;
}

const get = (v: unknown, key: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

export async function guide(llm: LLMClient, input: GuideInput, { signal }: TaskOptions = {}): Promise<GuideReply> {
  if (!isTemplateId(input.template)) throw new InputError('Unknown template.');
  const template = TEMPLATES[input.template];
  const frame = template.frames[input.step];
  if (!frame) throw new InputError('No such frame.');
  const before = input.before.slice(-20_000);
  const sentence = lastSentence(before);
  const none: GuideReply = { filled: false, missing: '', next: '', complete: false };
  if (!frameFilled(frame, sentence)) return none;

  // One paragraph: the judge names the sentences that state, support and draw
  // the point; code decides what is missing. Several paragraphs: a one-sentence
  // paragraph always lacks support, so there is nothing to judge.
  let missing = '';
  let complete = false;
  if (template.layout === 'paragraph') {
    const judged = await llm.json({
      model: await llm.modelFor('quick'),
      messages: P.judgeMessages({ before }),
      format: P.judgeSchema,
      maxTokens: 60,
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
    const verdict = paragraphVerdict(before, judged);
    missing = verdict.missing;
    complete = verdict.complete;
  }

  const out = await llm.json({
    model: await llm.modelFor('coach'),
    messages: P.guideMessages({
      title: input.title ?? '',
      ...(input.brief ? { brief: input.brief } : {}),
      template,
      step: input.step,
      before,
      sentence,
      missing,
    }),
    format: P.guideSchema,
    maxTokens: 160,
    ...(signal ? { signal } : {}),
  });
  // A question, or nothing: never a sentence in the shape of the frame it is about.
  const keep = (v: unknown, about: Frame) => {
    const s = field(v, 240);
    return guideReplyOk(about, s) ? s : '';
  };
  const next = template.frames[input.step + 1];
  return {
    filled: true,
    missing: keep(get(out, 'missing'), frame),
    next: next ? keep(get(out, 'next'), next) : '',
    complete,
  };
}
