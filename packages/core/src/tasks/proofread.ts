// Autocorrect's model half: proofread the sentence the writer has just
// finished. Only the fixes `correctionFixes` lets through come back, as
// offsets into the sentence.

import { correctionFixes, type Fix, MAX_PROOFREAD } from '../autocorrect.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import type { TaskOptions } from './common.ts';

export interface ProofreadInput {
  /** The sentence just finished. */
  sentence: string;
  /** The paragraph before it, for context. */
  before?: string;
  /** The writer writes apostrophes as ’. */
  curly?: boolean;
}

export async function proofread(llm: LLMClient, input: ProofreadInput, { signal }: TaskOptions = {}): Promise<Fix[]> {
  const { sentence } = input;
  if (sentence.length > MAX_PROOFREAD || (sentence.match(/\p{L}+/gu) ?? []).length < 2) return [];
  const model = await llm.modelFor('quick');
  const out = await llm
    .json({
      model,
      messages: P.proofreadMessages({ before: input.before ?? '', sentence }),
      format: P.proofreadSchema,
      // Room for the sentence again, and a little more.
      maxTokens: Math.ceil(sentence.length / 2) + 40,
      temperature: 0,
      ...(signal ? { signal } : {}),
    })
    .catch((err: unknown) => {
      if (signal?.aborted) throw err;
      return null; // an answer that isn't JSON: nothing to fix
    });
  const proofread = out && typeof out === 'object' && 'sentence' in out ? out.sentence : '';
  return typeof proofread === 'string'
    ? correctionFixes(sentence, proofread, input.curly === undefined ? {} : { curly: input.curly })
    : [];
}
