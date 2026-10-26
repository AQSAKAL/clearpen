// A free instruction ("write catchy subheadings") carried out as pinpoint
// edits: each insert or replacement streams out on its own, and nothing the
// instruction didn't ask about is touched. Edits only — a request for new
// writing is declined, and a returned "edit" that writes new material dropped.

import type { Hunk } from '../diff.ts';
import { type ModelEdit, placeEdit } from '../edits.ts';
import { asksToDelete, asksToWrite, removesTooMuch, writesNewMaterial } from '../intent.ts';
import { completedItems, completedString } from '../jsonstream.ts';
import type { LLMClient } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { InputError, loadingNotice, MAX_PASSAGE, type NoticeEvent, type TaskOptions } from './common.ts';
import { rewrite } from './write.ts';

export type EditEvent =
  | NoticeEvent
  | ({ type: 'edit' } & Hunk)
  /** `declined`: why no edits were made, when the instruction asked for new writing. */
  | { type: 'done'; count: number; missed: number; declined: string };

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

export async function* edit(llm: LLMClient, input: EditInput, opts: TaskOptions = {}): AsyncGenerator<EditEvent> {
  const { signal } = opts;
  const { text } = input;
  if (!text.trim()) throw new InputError('Nothing selected.');
  if (text.length > MAX_PASSAGE)
    throw new InputError('That selection is too long to edit in one go — try a section at a time.', 413);
  const instruction = input.instruction.trim();
  if (!instruction) throw new InputError('Say what to do with it.');
  // Margin edits; it doesn't write new material from scratch.
  if (asksToWrite(instruction)) {
    yield { type: 'done', count: 0, missed: 0, declined: 'That asks for new writing, not an edit.' };
    return;
  }

  const model = await llm.modelFor('quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;

  let raw = '';
  let seen = 0;
  let missed = 0;
  let wrote = 0;
  let threwAway = 0;
  const deleting = asksToDelete(instruction);
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
      // An "edit" that brings in a paragraph of new words is writing, not editing.
      if (writesNewMaterial(text, text.slice(change.from, change.to), change.insert)) {
        wrote++;
        continue;
      }
      // Deleting most of the passage isn't trimming it, unless that was the ask.
      if (!deleting && removesTooMuch(text, text.slice(change.from, change.to), change.insert)) {
        threwAway++;
        continue;
      }
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

  // The model threw the passage away instead of trimming it. Do the same
  // instruction as a rewrite, which marks only the words that change.
  if (!placed.length && threwAway) {
    for await (const ev of rewrite(llm, { ...input, instruction }, opts)) {
      if (ev.type === 'notice') yield ev;
      if (ev.type !== 'done') continue;
      for (const c of ev.changes) {
        const removed = text.slice(c.from, c.to);
        if (writesNewMaterial(text, removed, c.insert) || removesTooMuch(text, removed, c.insert)) continue;
        placed.push(c);
        yield { type: 'edit', from: c.from, to: c.to, insert: c.insert };
      }
    }
  }

  const declined =
    completedString(raw, 'declined') ||
    (wrote ? 'That would mean writing new material, not editing what’s there.' : '');
  yield { type: 'done', count: placed.length, missed, declined: placed.length ? '' : declined };
}
