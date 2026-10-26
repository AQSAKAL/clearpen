// A free instruction ("write catchy subheadings") carried out as pinpoint
// edits: each insert or replacement streams out on its own, and nothing the
// instruction didn't ask about is touched.

import type { Hunk } from '../diff.ts';
import { type ModelEdit, placeEdit } from '../edits.ts';
import { completedItems } from '../jsonstream.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { InputError, loadingNotice, MAX_PASSAGE, type NoticeEvent, type TaskOptions } from './common.ts';

export type EditEvent = NoticeEvent | ({ type: 'edit' } & Hunk) | { type: 'done'; count: number; missed: number };

export interface EditInput {
  title?: string;
  /** The passage; edit offsets are into this text. */
  text: string;
  instruction: string;
  before?: string;
  after?: string;
}

const isEdit = (e: unknown): e is ModelEdit =>
  !!e && typeof (e as ModelEdit).anchor === 'string' && typeof (e as ModelEdit).type === 'string';

export async function* edit(llm: LLMClient, input: EditInput, { signal }: TaskOptions = {}): AsyncGenerator<EditEvent> {
  const { text } = input;
  if (!text.trim()) throw new InputError('Nothing selected.');
  if (text.length > MAX_PASSAGE)
    throw new InputError('That selection is too long to edit in one go — try a section at a time.', 413);
  const instruction = input.instruction.trim();
  if (!instruction) throw new InputError('Say what to do with it.');

  const model = await llm.modelFor('quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;

  let raw = '';
  let seen = 0;
  let missed = 0;
  const placed: Hunk[] = [];
  // New edits found in what the model has written so far.
  function* flush(): Generator<EditEvent> {
    const items = completedItems(raw, 'edits').filter(isEdit);
    for (const e of items.slice(seen)) {
      const change = placeEdit(text, e);
      if (!change) {
        missed++;
        continue;
      }
      if (change.insert === text.slice(change.from, change.to)) continue;
      // Edits that overlap can't both apply; the first one wins.
      const clash = placed.some(
        (p) =>
          (change.from < p.to && p.from < change.to) ||
          (p.from === p.to && change.from === change.to && p.from === change.from),
      );
      if (clash) continue;
      placed.push(change);
      yield { type: 'edit', ...change };
    }
    seen = Math.max(seen, items.length);
  }

  const messages = P.editsMessages({ ...input, instruction });
  for await (const chunk of llm.stream({
    model,
    messages,
    format: P.editsSchema,
    maxTokens: Math.round(text.length / 1.5) + 600,
    temperature: 0.4,
    ...(signal ? { signal } : {}),
  })) {
    raw += chunk;
    yield* flush();
  }
  yield* flush();
  yield { type: 'done', count: placed.length, missed };
}
