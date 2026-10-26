// Thinking aids: the point a section must make, where the argument goes next,
// the objection to answer, the questions only the author can answer. Coach
// notes in groups — never prose. Writing is the author's job.

import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { field, InputError, type TaskOptions } from './common.ts';

export interface NoteGroup {
  label: string;
  items: string[];
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const get = (v: unknown, key: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

/** Model output → at most 6 labelled groups of at most 8 short notes each. */
export function normaliseGroups(out: unknown): NoteGroup[] {
  return list(get(out, 'groups'))
    .map((g) => ({
      label: field(get(g, 'label'), 80),
      items: list(get(g, 'items'))
        .map((i) => field(i, 300))
        .filter(Boolean)
        .slice(0, 8),
    }))
    .filter((g) => g.label && g.items.length)
    .slice(0, 6);
}

export const isThinkKind = (k: unknown): k is P.ThinkKind => typeof k === 'string' && Object.hasOwn(P.THINK_KINDS, k);

export async function think(llm: LLMClient, input: P.ThinkInput, { signal }: TaskOptions = {}): Promise<NoteGroup[]> {
  if (!isThinkKind(input.kind)) throw new InputError('Unknown kind of help.');
  const model = await llm.modelFor('coach');
  const out = await llm.json({
    model,
    messages: P.thinkMessages(input),
    format: P.thinkSchema,
    maxTokens: 900,
    ...(signal ? { signal } : {}),
  });
  const groups = normaliseGroups(out);
  if (!groups.length) throw new Error('No notes came back — try again.');
  return groups;
}
