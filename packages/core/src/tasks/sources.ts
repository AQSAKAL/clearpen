// The writer's sources at work. `findPassages`: what a suggestion may draw
// on — BM25's best when it is clearly best, else the ones the model picks
// from a short list, by number, kept only when the number names a window. A
// pick holds while the writer stays in the paragraph and the short list stays
// the same, so a paragraph of five sentences asks once, not five times.
// `askSources`: the writer's own question, answered from the pages alone.

import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import {
  isDecisive,
  MAX_PASSAGES,
  maskSource,
  type Passage,
  passagesFor,
  rankWindows,
  SHORTLIST,
  type Source,
  sourceQuery,
  sourceWindows,
} from '../sources.ts';
import type { TaskOptions } from './common.ts';

const picks = new Map<string, number[]>();
const MAX_PICKS = 50;

export async function findPassages(
  llm: LLMClient,
  { sources, before }: { sources?: Source[]; before: string },
  { model, signal }: { model: string; signal?: AbortSignal },
): Promise<Passage[]> {
  if (!sources?.length) return [];
  const windows = sourceWindows(sources);
  const query = sourceQuery(before);
  const ranked = rankWindows(windows, query).slice(0, SHORTLIST);
  if (!ranked.length) return [];
  if (isDecisive(ranked)) return passagesFor(windows, [ranked[0]!.window.id]);

  const shortlist = ranked.map((r) => r.window);
  // The paragraph is known by how it opens, which stays put as it grows.
  const paragraph = before.slice(before.lastIndexOf('\n\n') + 1).trim();
  const listed = shortlist.map((w) => w.id).sort((x, y) => x - y);
  const key = `${sources.map((s) => `${s.id}@${s.addedAt}`).join(',')}|${listed.join(',')}|${paragraph.slice(0, 24)}`;
  let ids = picks.get(key);
  if (!ids) {
    try {
      const answer = (await llm.json({
        model,
        messages: P.pickMessages({ writing: query, windows: shortlist }),
        format: P.pickSchema,
        maxTokens: 40,
        temperature: 0,
        ...(signal ? { signal } : {}),
      })) as { passages?: unknown };
      const named = Array.isArray(answer?.passages) ? answer.passages : [];
      ids = named.filter((n): n is number => Number.isInteger(n) && shortlist.some((w) => w.id === n));
    } catch (err) {
      if (signal?.aborted) throw err;
      // An answer that isn't JSON: BM25's best few will do.
      ids = shortlist.slice(0, MAX_PASSAGES).map((w) => w.id);
    }
    if (picks.size >= MAX_PICKS) picks.delete(picks.keys().next().value!);
    picks.set(key, ids);
  }
  return passagesFor(windows, ids);
}

export interface SourceQuestion {
  question: string;
  /** The passage of the article the question is about, when the writer selected one. */
  about?: string;
  title?: string;
  sources?: Source[];
}

export interface SourceAnswer {
  /** A passage answered it. */
  found: boolean;
  /** The answer, or why there is none. */
  answer: string;
  /** The passages the answer came from, the most useful first. */
  passages: Passage[];
}

export const NOT_IN_SOURCES = 'Your sources don’t say.';

/**
 * An answer as the reader may see it: without the passage numbers a model
 * sometimes cites in it ("Passage [11] states that there were…", "…keys [3].").
 */
export function tidyAnswer(answer: string): string {
  const out = answer
    .replace(
      /^(?:according to\s+)?(?:the\s+)?(?:passages?|sources?)\s*\[?\d+\]?(?:\s*(?:,|and)\s*\[?\d+\]?)*\s*(?:,\s*)?(?:(?:states?|says?|shows?|notes?|mentions?|reports?|explains?)\s+(?:that\s+)?)?/i,
      '',
    )
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .trim();
  return out ? out[0]!.toUpperCase() + out.slice(1) : out;
}

/** The writer's question, answered from the passages of their sources that bear on it — and nothing else. */
export async function askSources(
  llm: LLMClient,
  { question, about = '', title = '', sources = [] }: SourceQuestion,
  { signal }: TaskOptions = {},
): Promise<SourceAnswer> {
  const none: SourceAnswer = { found: false, answer: NOT_IN_SOURCES, passages: [] };
  if (!question.trim() || !sources.length) return none;
  const windows = sourceWindows(sources);
  const ranked = rankWindows(windows, `${question}\n${about}`).slice(0, SHORTLIST);
  if (!ranked.length) return none;
  const shortlist = passagesFor(
    windows,
    ranked.map((r) => r.window.id),
    SHORTLIST,
  );
  const model = await llm.modelFor('quick');
  const out = (await llm.json({
    model,
    messages: P.sourceAnswerMessages({ question, about, title, passages: shortlist }),
    format: P.sourceAnswerSchema,
    maxTokens: 260,
    temperature: 0.2,
    ...(signal ? { signal } : {}),
  })) as { answer?: unknown; passages?: unknown };
  const named = Array.isArray(out?.passages) ? out.passages : [];
  const used = [...new Set(named)].map((n) => shortlist.find((p) => p.id === n)).filter((p): p is Passage => !!p);
  const answer = typeof out?.answer === 'string' ? tidyAnswer(out.answer) : '';
  // An answer that names no passage is the model's own, not the sources'.
  if (!answer || !used.length) return none;
  return { found: true, answer: maskSource(answer), passages: used };
}
