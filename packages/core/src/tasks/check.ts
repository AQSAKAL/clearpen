// Checks a passage — its facts, its logic or its consistency with the draft —
// and streams a verdict per claim. Never rewrites anything.
//
// Clearpen's exact checks run first and their results are handed to the model
// as ground truth. Corrections the fact-checker wants to make are asked again,
// neutrally, before anyone sees them: asked to "find errors", a small model
// invents some; asked plainly whether its own correction is true, it usually
// knows.

import { findQuote } from '../anchor.ts';
import { factsBlock, runChecks } from '../checks.ts';
import type { Lens } from '../intent.ts';
import { completedItems, completedString } from '../jsonstream.ts';
import type { LLMClient } from '../llm/client.ts';
import { checkOptions } from '../modes.ts';
import * as P from '../prompts.ts';
import { InputError, loadingNotice, MAX_PASSAGE, type NoticeEvent, type TaskOptions } from './common.ts';

export interface CheckItem {
  verdict: string;
  /** Nothing to fix ("correct", "sound", "consistent"…). */
  ok: boolean;
  explanation: string;
  fix: string;
  /** Offsets into the whole document. */
  from: number;
  to: number;
  /** False when the model's quote wasn't found and the item covers the whole passage. */
  anchored: boolean;
  /** The model confirmed its correction when asked again. */
  verified?: boolean;
}

export type CheckEvent =
  | NoticeEvent
  | { type: 'item'; item: CheckItem }
  | { type: 'done'; overall: string; summary: string; dropped: number };

export interface CheckInput {
  title?: string;
  /** The whole document. */
  content: string;
  /** The passage to check: [from, to) of `content`. */
  from: number;
  to: number;
  lens?: Lens;
  brief?: P.Brief;
}

interface RawItem {
  quote: string;
  explanation: string;
  verdict?: string;
  fix?: string;
}

const isItem = (n: unknown): n is RawItem =>
  !!n && typeof (n as RawItem).quote === 'string' && typeof (n as RawItem).explanation === 'string';

export async function* check(
  llm: LLMClient,
  input: CheckInput,
  { signal }: TaskOptions = {},
): AsyncGenerator<CheckEvent> {
  const { content } = input;
  const from = Math.max(0, Math.min(input.from || 0, content.length));
  const to = Math.max(from, Math.min(input.to || 0, content.length));
  const text = content.slice(from, to);
  if (!text.trim()) throw new InputError('Select the passage to check.');
  if (text.length > MAX_PASSAGE)
    throw new InputError('That’s too much to check in one go — select a section at a time.', 413);
  const lens: Lens = input.lens && input.lens in P.CHECK_LENSES ? input.lens : 'factcheck';
  const L = P.CHECK_LENSES[lens];

  // Exact arithmetic first, so the model is told the answer instead of guessing it.
  const exact = runChecks(content, checkOptions(input.brief));
  const facts = factsBlock({ facts: exact.facts, findings: exact.findings.filter((f) => f.from < to && f.to > from) });

  // Checking facts is the job a larger model does best.
  const model = await llm.modelFor(lens === 'factcheck' ? 'checker' : 'quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;

  let raw = '';
  let seen = 0;
  const doubtful: CheckItem[] = [];
  function* flush(): Generator<CheckEvent> {
    const items = completedItems(raw, 'items').filter(isItem);
    for (const n of items.slice(seen)) {
      // Anchor inside the passage; a quote the model made up covers the whole passage.
      const at = findQuote(text, n.quote);
      const verdict = n.verdict && L.verdicts.includes(n.verdict) ? n.verdict : L.verdicts[0]!;
      const item: CheckItem = {
        verdict,
        ok: L.ok.includes(verdict),
        explanation: n.explanation.trim(),
        fix: typeof n.fix === 'string' ? n.fix.trim() : '',
        from: from + (at ? at.from : 0),
        to: from + (at ? at.to : text.length),
        anchored: !!at,
      };
      if (lens === 'factcheck' && (verdict === 'incorrect' || verdict === 'misleading')) doubtful.push(item);
      else yield { type: 'item', item };
    }
    seen = Math.max(seen, items.length);
  }

  const messages = P.checkMessages({
    title: input.title ?? '',
    text,
    before: content.slice(Math.max(0, from - 16_000), from),
    after: content.slice(to, to + 9000),
    lens,
    ...(input.brief ? { brief: input.brief } : {}),
    facts,
  });
  for await (const chunk of llm.stream({
    model,
    messages,
    format: P.checkSchema(lens),
    maxTokens: 1800,
    temperature: 0,
    ...(signal ? { signal } : {}),
  })) {
    raw += chunk;
    yield* flush();
  }
  yield* flush();

  let dropped = 0;
  for (const [i, item] of doubtful.entries()) {
    if (signal?.aborted) return;
    yield {
      type: 'notice',
      text: `Double-checking ${doubtful.length > 1 ? `${i + 1} of ${doubtful.length} corrections` : 'the correction'}…`,
    };
    let answer = 'unsure';
    try {
      const out = (await llm.json({
        model,
        messages: P.verifyMessages(item.explanation),
        format: P.verifySchema,
        maxTokens: 250,
        temperature: 0,
        ...(signal ? { signal } : {}),
      })) as { answer?: string };
      answer = out.answer || 'unsure';
    } catch {
      // Treated as unsure.
    }
    if (answer === 'true') yield { type: 'item', item: { ...item, verified: true } };
    else if (answer === 'unsure') {
      const quoted = item.explanation.length > 160 ? `${item.explanation.slice(0, 160)}…` : item.explanation;
      yield {
        type: 'item',
        item: {
          ...item,
          verdict: 'unverifiable',
          ok: false,
          fix: '',
          explanation: `Possibly wrong, but the model couldn’t confirm its own correction (“${quoted}”). Check it against a primary source.`,
        },
      };
    } else dropped++;
  }
  const overall = completedString(raw, 'overall') ?? '';
  // If every correction fell through, the model's overall verdict described them.
  const keepOverall = L.overall.includes(overall) && !(dropped && doubtful.length === dropped);
  yield { type: 'done', overall: keepOverall ? overall : '', summary: completedString(raw, 'summary') || '', dropped };
}
