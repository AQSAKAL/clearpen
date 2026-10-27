// The instructions the models get: the editing principles ride with every
// edit, the review reads for a named reader, and a fourth lens judges how a
// passage reads.
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { intentOf } from '../src/intent.ts';
import { LENS_CATEGORIES } from '../src/notes.ts';
import {
  CHECK_LENSES,
  checkMessages,
  checkSchema,
  EDITING_PRINCIPLES,
  editsMessages,
  READERS,
  REWRITES,
  reviewMessages,
  rewriteMessages,
  THINK_KINDS,
  thinkMessages,
} from '../src/prompts.ts';
import { review } from '../src/tasks/review.ts';
import { chunks, collect, fakeLLM, lastUser } from './fake.ts';

test('every edit carries the editing principles, and the rewrite actions say what to keep', () => {
  assert.match(EDITING_PRINCIPLES, /subject to be followed soon by its verb/);
  assert.match(EDITING_PRINCIPLES, /stresses whatever it ends on/);
  assert.match(EDITING_PRINCIPLES, /action in the verb/);
  assert.match(EDITING_PRINCIPLES, /Keep a hedge that carries information/);
  const [system] = rewriteMessages({ text: 'x', instruction: 'y' });
  assert.ok(system!.content.includes(EDITING_PRINCIPLES));
  assert.ok(editsMessages({ text: 'x', instruction: 'y' })[0]!.content.includes(EDITING_PRINCIPLES));
  // Clarify restructures without cutting; Shorten cuts without flattening; Simplify keeps the voice.
  assert.match(REWRITES.clarify, /without shortening it/);
  assert.match(REWRITES.clarify, /Add nothing/);
  assert.match(REWRITES.shorten, /any word the next sentence picks up/);
  assert.match(REWRITES.simplify, /say it aloud to a friend/);
  assert.match(REWRITES.simplify, /contractions, questions, asides/);
  assert.match(REWRITES.confident, /Keep a hedge that marks a real degree of certainty/);
  assert.match(REWRITES.grammar, /not a passive/);
});

test('a typed instruction about how a passage reads is a check, not an edit', () => {
  assert.equal(intentOf('is this clear?'), 'clarity');
  assert.equal(intentOf('check the flow'), 'clarity');
  assert.equal(intentOf('how does it read?'), 'clarity');
  assert.equal(intentOf('is it easy to follow?'), 'clarity');
  assert.equal(intentOf('make it clearer'), null, 'an edit, not a verdict');
  assert.equal(intentOf('can you make this clearer'), null);
  assert.equal(intentOf('check the logic'), 'logic');
  assert.equal(intentOf('does this follow?'), 'logic');
  assert.equal(intentOf('is this consistent with the rest?'), 'consistency');
  assert.deepEqual(LENS_CATEGORIES.clarity, ['clarity', 'structure', 'concision', 'style']);
});

test('the reading lens judges each sentence as a reader and reorders only the author’s words', () => {
  const L = CHECK_LENSES.clarity;
  assert.deepEqual(L.ok, ['clear']);
  assert.ok(L.verdicts.includes('new before old') && L.verdicts.includes('subject far from verb'));
  assert.match(L.system, /never rewrite it/);
  assert.match(L.system, /reordering of the author's own words/);
  const [system, user] = checkMessages({ text: 'The team made a decision.', lens: 'clarity' });
  assert.match(system!.content, /You answer only with JSON/);
  assert.match(user!.content, /what a reader does at this sentence/);
  assert.match(user!.content, /every sentence of the passage, in order/);
  const schema = checkSchema('clarity') as { properties: { overall: { enum: string[] } } };
  assert.deepEqual(schema.properties.overall.enum, ['clear', 'mostly clear', 'hard to follow']);
  // The other lenses keep their own question.
  assert.match(checkMessages({ text: 'x', lens: 'logic' })[1]!.content, /first work out what is actually true here/);
});

test('the review reads for the piece’s reader, in order of importance, and skips what code already found', () => {
  const [system, user] = reviewMessages({ content: 'x', brief: { genre: 'scientific' } });
  assert.match(system!.content, /Read at three levels/);
  assert.match(system!.content, /1\. The argument[\s\S]*2\. The structure[\s\S]*3\. The sentences/);
  assert.match(system!.content, /Never flag "I think"/);
  assert.ok(system!.content.includes(READERS.scientific!));
  assert.match(user!.content, /also check the opening/);
  // An article gets the general reader and no structural ask.
  const article = reviewMessages({ content: 'x' });
  assert.ok(article[0]!.content.includes(READERS.article!));
  assert.doesNotMatch(article[1]!.content, /also check the opening/);
  assert.match(reviewMessages({ content: 'x', facts: 'ALREADY FLAGGED BY SOFTWARE' })[1]!.content, /ALREADY FLAGGED/);
});

test('review hands the model what Clearpen’s own checks found', async () => {
  const content = `${'Our team writes decisions down and reads them back every Friday. '.repeat(3)}Studies show that teams who write things down are 47% more productive.`;
  const { llm, provider } = fakeLLM({ stream: () => chunks('{"summary":"Fine.","notes":[]}') });
  await collect(review(llm, { content }));
  assert.match(lastUser(provider.requests[0]!), /ALREADY FLAGGED BY SOFTWARE[\s\S]*Needs a source/);
});

test('the new thinking aids quote the author’s own steps and ask one reader’s question', () => {
  assert.ok('steps' in THINK_KINDS && 'reader' in THINK_KINDS);
  const steps = thinkMessages({
    kind: 'steps',
    before: 'Most advice is about control. Control only works while you are in the room.',
  });
  assert.match(steps[0]!.content, /quote the author's own sentences back to them, word for word/);
  assert.match(steps[1]!.content, /"Your claims, in order"[\s\S]*"Where a step is missing"/);
  const reader = thinkMessages({ kind: 'reader', brief: { audience: 'a sceptical CFO' } });
  assert.match(reader[1]!.content, /Audience: a sceptical CFO/);
  assert.match(reader[1]!.content, /A question, never an answer/);
});
