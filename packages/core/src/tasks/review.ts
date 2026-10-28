// The editor's review: margin notes stream out one by one, each anchored to
// the exact passage it is about. Before the notes, the model's verdict on
// each paragraph: the ones that have not yet made their point are sent once,
// and the sentence-level notes on them are marked held (the point-made gate
// in notes.ts says why, and what the margin does with them).

import { createAnchorer, type Span } from '../anchor.ts';
import { factsBlock, runChecks } from '../checks.ts';
import { completedArray, completedItems, completedString } from '../jsonstream.ts';
import type { LLMClient } from '../llm/client.ts';
import { heldBack, judgedParagraphs, type Unfinished } from '../notes.ts';
import * as P from '../prompts.ts';
import { InputError, loadingNotice, type NoticeEvent, type TaskOptions, wordCount } from './common.ts';

export interface ReviewNote extends Span {
  quote: string;
  category: P.NoteCategory;
  issue: string;
  suggestion: string;
  /** Sentence polish on a paragraph that has not yet made its point: shown only when the writer asks (`heldBack`). */
  held?: boolean;
}

export type ReviewEvent =
  | NoticeEvent
  | { type: 'summary'; text: string }
  /** The paragraphs judged not to have made their point yet. Sent once, before any note; empty when every paragraph does its job. */
  | { type: 'unfinished'; paragraphs: Unfinished[] }
  | { type: 'note'; note: ReviewNote }
  | { type: 'done'; found: number };

interface RawNote {
  quote: string;
  issue: string;
  category?: string;
  suggestion?: string;
}

const isNote = (n: unknown): n is RawNote =>
  !!n && typeof (n as RawNote).quote === 'string' && typeof (n as RawNote).issue === 'string';
const isCategory = (c: unknown): c is P.NoteCategory => (P.NOTE_CATEGORIES as readonly unknown[]).includes(c);

/** "A reason to believe the claim." → "a reason to believe the claim", to read on after "it still needs". */
function phrase(s: unknown): string {
  let m =
    typeof s === 'string'
      ? s
          .trim()
          .replace(/[.!]+$/, '')
          .slice(0, 200)
      : '';
  // A sentence-initial capital goes; initials ("SQLite") and a lone "I" stay.
  if (/^[A-Z](?![A-Z0-9])/.test(m) && !/^I\b/.test(m)) m = m[0]!.toLowerCase() + m.slice(1);
  return m || 'its point, or what stands behind it';
}

export async function* review(
  llm: LLMClient,
  input: { title?: string; content: string; brief?: P.Brief },
  { signal }: TaskOptions = {},
): AsyncGenerator<ReviewEvent> {
  const { content } = input;
  if (wordCount(content) < 30) throw new InputError('Write a little more first — there is nothing to review yet.');
  const model = await llm.modelFor('quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;

  // What Clearpen's own checks found goes to the model as settled, so the
  // notes it adds are the ones only a reader can make.
  const exact = runChecks(content, { genre: input.brief?.genre || 'article', sources: input.brief?.notes || '' });
  const facts = factsBlock(exact);
  // The paragraphs the model judges, by number — only those it gets to read.
  const judged = judgedParagraphs(content).filter((p) => p.to <= P.REVIEW_CHARS);

  // The model's list, by number, becomes spans in the draft; a number that
  // names no paragraph, or names one twice, doesn't count.
  const verdicts = (items: unknown[]): Unfinished[] => {
    const out: Unfinished[] = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const { paragraph, missing } = it as { paragraph?: unknown; missing?: unknown };
      const n = typeof paragraph === 'number' ? paragraph : typeof paragraph === 'string' ? Number(paragraph) : NaN;
      const p = Number.isInteger(n) ? judged[n - 1] : undefined;
      if (!p || out.some((u) => u.from === p.from)) continue;
      out.push({ from: p.from, to: p.to, missing: phrase(missing) });
    }
    return out;
  };

  const place = createAnchorer(content);
  let raw = '';
  let sentSummary = false;
  let unfinished: Unfinished[] | null = null;
  let seen = 0;
  let found = 0;
  function* flush(final = false): Generator<ReviewEvent> {
    const summary = completedString(raw, 'summary');
    if (summary && !sentSummary) {
      sentSummary = true;
      yield { type: 'summary', text: summary };
    }
    // The verdicts go out once the list has closed — or, if the model skipped
    // it, before the first note or at the end, so the margin never waits.
    if (!unfinished) {
      const items =
        completedArray(raw, 'unfinished') ??
        (final || completedItems(raw, 'notes').length ? completedItems(raw, 'unfinished') : null);
      if (items) {
        unfinished = verdicts(items);
        yield { type: 'unfinished', paragraphs: unfinished };
      }
    }
    const items = completedItems(raw, 'notes').filter(isNote);
    for (const n of items.slice(seen)) {
      // A quote that isn't in the draft can't be pinned to it: dropped.
      const note = place({
        quote: n.quote,
        category: isCategory(n.category) ? n.category : 'clarity',
        issue: n.issue.trim(),
        suggestion: typeof n.suggestion === 'string' ? n.suggestion.trim() : '',
      });
      if (note) {
        found++;
        yield { type: 'note', note: unfinished && heldBack(unfinished, note) ? { ...note, held: true } : note };
      }
    }
    seen = Math.max(seen, items.length);
  }

  for await (const chunk of llm.stream({
    model,
    messages: P.reviewMessages({ ...input, facts, paragraphs: judged.map((p) => p.opening) }),
    format: P.reviewSchema,
    maxTokens: 2600,
    temperature: 0.3,
    ...(signal ? { signal } : {}),
  })) {
    raw += chunk;
    yield* flush();
  }
  yield* flush(true);
  yield { type: 'done', found };
}
