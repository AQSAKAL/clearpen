// The voice guard on Simplify and Shorten: what a rewrite may change, and
// what is the author's — checked on the diff, against the scripted model.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { applyHunks } from '../src/diff.ts';
import { rewrite } from '../src/tasks/write.ts';
import { voiceWarnings } from '../src/voice.ts';
import { chunks, collect, fakeLLM } from './fake.ts';

/** Runs `action` on `text` against a model that answers `answer`. */
async function run(text: string, answer: string, action: 'simplify' | 'shorten' | 'improve' = 'simplify') {
  const { llm } = fakeLLM({ stream: () => chunks(answer) });
  const done = (await collect(rewrite(llm, { text, action }))).at(-1);
  if (done?.type !== 'done') throw new Error('no done event');
  return done;
}

/** The reasons a simplify drops changes, in order. */
const drops = (text: string, result: string) =>
  voiceWarnings(text, result, 'simplify')
    .map((v) => v.drop)
    .filter(Boolean);

test('a simplify that keeps the vivid phrase and the question passes untouched', async () => {
  const text = 'We utilise the cache on every request. Is that wise? It’s a gamble, frankly a glorious one.';
  const answer = 'We use the cache on every request. Is that wise? It’s a gamble, frankly a glorious one.';
  const done = await run(text, answer);
  assert.equal(done.text, answer);
  assert.deepEqual(done.dropped, []);
  assert.equal(done.changes.length, 1);
  assert.equal(done.changes[0]!.warning, '');
  assert.equal(applyHunks(text, done.changes), done.text);
});

test('a simplify that cuts the word the next sentence picks up is dropped; Improve is not guarded', async () => {
  const text = 'We measured the latency first. That latency, it turned out, was the whole problem.';
  const answer = 'We measured it first. That latency, it turned out, was the whole problem.';
  const done = await run(text, answer);
  assert.equal(done.text, text, 'the dropped change is reverted');
  assert.deepEqual(done.changes, []);
  assert.deepEqual(done.dropped, ['cuts “latency”, which your next sentence picks up']);
  const improved = await run(text, answer, 'improve');
  assert.equal(improved.text, answer);
  assert.deepEqual(improved.dropped, []);
  assert.equal(improved.changes.length, 1);
});

test('a shorten that cuts the closing sentence reaches the editor with a warning', async () => {
  const text =
    'The team shipped the billing page on Monday. By Wednesday the support queue had halved. Nobody had expected that.';
  const answer = 'The team shipped the billing page on Monday. By Wednesday the support queue had halved.';
  const done = await run(text, answer, 'shorten');
  assert.deepEqual(done.dropped, []);
  assert.equal(done.changes.length, 1);
  assert.match(done.changes[0]!.warning, /^Check: cuts the last sentence of your paragraph/);
  assert.equal(done.text, answer);
  assert.equal(applyHunks(text, done.changes), done.text);
});

test('a rewrite keeps the changes that pass and reverts the ones held back', async () => {
  const text = 'We don’t ship on Fridays. We utilise the cache.';
  const done = await run(text, 'We do not ship on Fridays. We use the cache.');
  assert.equal(done.text, 'We don’t ship on Fridays. We use the cache.');
  assert.deepEqual(done.dropped, ['expands “don’t”']);
  assert.deepEqual(
    done.changes.map((c) => c.warning),
    [''],
  );
  assert.equal(applyHunks(text, done.changes), done.text);
});

test('a question made a statement, a contraction expanded or made, a hedge cut: each is dropped', () => {
  assert.deepEqual(drops('Is the cache the problem? Probably.', 'The cache is the problem. Probably.'), [
    'turns your question into a statement',
  ]);
  assert.deepEqual(drops('We don’t ship on Fridays. It’s a rule.', 'We do not ship on Fridays. It is a rule.'), [
    'expands “don’t”',
    'expands “It’s”',
  ]);
  assert.deepEqual(drops('We do not ship on Fridays.', 'We don’t ship on Fridays.'), ['contracts “do not”']);
  assert.deepEqual(
    drops(
      'I think the cache is the problem. It misses about half the time.',
      'The cache is the problem. It misses about half the time.',
    ),
    ['cuts the hedge “I think”'],
  );
  // Moved, not cut: the hedge is still there.
  assert.deepEqual(drops('I think the cache is the problem.', 'The cache is the problem, I think.'), []);
  // A deleted clause that merely contained a contraction isn't a change of convention.
  assert.deepEqual(drops('We ship weekly, and it’s fine.', 'We ship weekly.'), []);
});

test('the pivot survives the same plain word on both sides, and the passage’s subject is not a pivot', () => {
  assert.deepEqual(
    drops(
      'We utilise the cache first. Nobody should utilise it twice.',
      'We use the cache first. Nobody should use it twice.',
    ),
    [],
  );
  assert.deepEqual(
    drops(
      'Bees fly at dawn. Bees rest at noon. Bees sleep at night.',
      'Bees fly at dawn. They rest at noon. Bees sleep at night.',
    ),
    [],
  );
  assert.deepEqual(
    drops(
      'The queue grew all week. By Friday that queue was the story.',
      'The backlog grew all week. By Friday that queue was the story.',
    ),
    ['cuts “queue”, which your next sentence picks up'],
  );
});

test('a simplify that evens out the sentence lengths is warned, not dropped; other actions pass', () => {
  const text =
    'It failed. The retry logic, which nobody had touched since the migration, kept hammering the primary until the connection pool gave out and the dashboards went dark. We noticed late.';
  const result =
    'It failed. The retry logic kept hammering the primary. Nobody had touched it since the migration. The connection pool gave out and the dashboards went dark. We noticed late.';
  const verdicts = voiceWarnings(text, result, 'simplify');
  assert.ok(verdicts.length);
  assert.ok(verdicts.every((v) => !v.drop));
  assert.ok(verdicts.some((v) => /evens out your sentence lengths/.test(v.warning)));
  for (const action of ['clarify', 'improve', 'confident', undefined] as const) {
    const passed = voiceWarnings(text, result, action);
    assert.equal(passed.length, verdicts.length);
    assert.ok(
      passed.every((v) => !v.drop && !v.warning),
      String(action),
    );
  }
});
