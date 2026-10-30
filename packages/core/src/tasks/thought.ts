import { paragraphSentences, paragraphVerdict } from '../autocomplete.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import type { TaskOptions } from './common.ts';

export interface ThoughtNode {
  /** 1-based index into the paragraph's sentences. */
  index: number;
  text: string;
  role: 'point' | 'support' | 'meaning' | 'other';
}

export interface ThoughtTree {
  sentences: ThoughtNode[];
}

export async function thoughtTree(
  llm: LLMClient,
  before: string,
  { signal }: TaskOptions = {},
): Promise<ThoughtTree> {
  const sentences = paragraphSentences(before);
  const model = await llm.modelFor('quick');
  let judged: unknown = null;
  try {
    judged = await llm.json({
      model,
      messages: P.judgeMessages({ before }),
      format: P.judgeSchema,
      maxTokens: 60,
      temperature: 0,
      ...(signal ? { signal } : {}),
    });
  } catch {
    judged = null;
  }
  const verdict = judged ? paragraphVerdict(before, judged) : null;
  // Map point/support/meaning to sentence indices from the judge's answer.
  const idx = (key: string) => {
    const a = judged && typeof judged === 'object' ? (judged as Record<string, unknown>)[key] : undefined;
    if (typeof a === 'number' && Number.isInteger(a) && a >= 1 && a <= sentences.length) return a;
    if (typeof a === 'string' && /^\s*\d+\s*$/.test(a)) {
      const n = Number(a);
      if (Number.isInteger(n) && n >= 1 && n <= sentences.length) return n;
    }
    return null;
  };
  const pointIdx = idx('point');
  const supportIdx = idx('support');
  const meaningIdx = idx('meaning');
  const nodes: ThoughtNode[] = sentences.map((text, i) => {
    const n = i + 1;
    let role: ThoughtNode['role'] = 'other';
    if (n === pointIdx) role = 'point';
    else if (n === supportIdx) role = 'support';
    else if (n === meaningIdx) role = 'meaning';
    return { index: n, text, role };
  });
  // Ensure verdict parts reflect presence even if judge omitted indices.
  void verdict;
  return { sentences: nodes };
}
