// The editor's review: margin notes stream out one by one, each anchored to
// the exact passage it is about.

import { createAnchorer, type Span } from '../anchor.ts';
import { factsBlock, runChecks } from '../checks.ts';
import { completedItems, completedString } from '../jsonstream.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { InputError, loadingNotice, type NoticeEvent, type TaskOptions, wordCount } from './common.ts';

export interface ReviewNote extends Span {
  quote: string;
  category: P.NoteCategory;
  issue: string;
  suggestion: string;
}

export type ReviewEvent =
  | NoticeEvent
  | { type: 'summary'; text: string }
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

  const place = createAnchorer(content);
  let raw = '';
  let sentSummary = false;
  let seen = 0;
  let found = 0;
  function* flush(): Generator<ReviewEvent> {
    const summary = completedString(raw, 'summary');
    if (summary && !sentSummary) {
      sentSummary = true;
      yield { type: 'summary', text: summary };
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
        yield { type: 'note', note };
      }
    }
    seen = Math.max(seen, items.length);
  }

  for await (const chunk of llm.stream({
    model,
    messages: P.reviewMessages({ ...input, facts }),
    format: P.reviewSchema,
    maxTokens: 2600,
    temperature: 0.3,
    ...(signal ? { signal } : {}),
  })) {
    raw += chunk;
    yield* flush();
  }
  yield* flush();
  yield { type: 'done', found };
}
