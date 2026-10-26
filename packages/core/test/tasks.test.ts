// The AI tasks, run against a scripted model: what reaches the writer, and
// what never should.
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { applyHunks } from '../src/diff.ts';
import { check } from '../src/tasks/check.ts';
import { InputError, streamText } from '../src/tasks/common.ts';
import { edit } from '../src/tasks/edit.ts';
import { headlines, meta, normaliseOutline, outline } from '../src/tasks/plan.ts';
import { review } from '../src/tasks/review.ts';
import { complete, rewrite } from '../src/tasks/write.ts';
import { chunks, collect, fakeLLM, lastUser } from './fake.ts';

const passage = 'First para here.\n\nSecond para here.\n\nLast para here.';

test('free instructions become pinpoint edits; bad and clashing ones are dropped', async () => {
  const answer = JSON.stringify({
    edits: [
      { type: 'insert_before', anchor: 'Second para here.', text: '## Middle' },
      { type: 'replace', anchor: 'not in the passage', text: 'x' },
      { type: 'replace', anchor: 'Second para', text: 'Overlapping' },
      { type: 'replace', anchor: 'Last para', text: 'Final paragraph' },
    ],
  });
  const { llm, provider } = fakeLLM({ stream: () => chunks(answer, 9) });
  const events = await collect(edit(llm, { text: passage, instruction: 'add a heading and tidy the end' }));
  const edits = events.filter((e) => e.type === 'edit');
  // The heading insert and the overlapping replace don't overlap (one is a point), so both land.
  assert.equal(
    applyHunks(passage, edits),
    'First para here.\n\n## Middle\n\nOverlapping here.\n\nFinal paragraph here.',
  );
  assert.deepEqual(events.at(-1), { type: 'done', count: 3, missed: 1 });
  assert.ok(provider.requests[0]!.format, 'the answer is constrained to the edits schema');
  await assert.rejects(collect(edit(llm, { text: '  ', instruction: 'x' })), InputError);
});

test('fact-check: a confirmed correction is kept, an unconfirmed one dropped, a doubtful one softened', async () => {
  const content =
    'Intro.\n\nBM25 replaces full-text search. Python was released in 1991. The sky is green. Water is wet.';
  const from = content.indexOf('BM25');
  const answer = JSON.stringify({
    items: [
      {
        quote: 'BM25 replaces full-text search.',
        explanation: 'BM25 is a ranking function used inside full-text search.',
        verdict: 'misleading',
        fix: 'BM25 ranks full-text search results.',
      },
      {
        quote: 'Python was released in 1991.',
        explanation: 'Python was first released in 1994.',
        verdict: 'incorrect',
        fix: 'Python was released in 1994.',
      },
      {
        quote: 'The sky is green.',
        explanation: 'The sky is usually blue.',
        verdict: 'incorrect',
        fix: 'The sky is blue.',
      },
      { quote: 'Water is wet.', explanation: 'Commonly accepted.', verdict: 'correct', fix: '' },
    ],
    overall: 'misleading',
    summary: 'Two claims need fixing.',
  });
  const verdicts: Record<string, string> = { BM25: 'true', Python: 'false', sky: 'unsure' };
  const { llm } = fakeLLM({
    stream: () => chunks(answer, 13),
    complete: (req) =>
      JSON.stringify({
        answer: Object.entries(verdicts).find(([k]) => lastUser(req).includes(k))?.[1] ?? 'unsure',
        reasoning: '',
      }),
  });
  const events = await collect(check(llm, { content, from, to: content.length, lens: 'factcheck' }));
  const items = events.flatMap((e) => (e.type === 'item' ? [e.item] : []));
  const bm25 = items.find((i) => content.slice(i.from, i.to).startsWith('BM25'))!;
  assert.equal(bm25.verified, true);
  assert.equal(bm25.verdict, 'misleading');
  assert.ok(
    !items.some((i) => content.slice(i.from, i.to).startsWith('Python')),
    'a correction the model won’t stand behind is dropped',
  );
  const sky = items.find((i) => content.slice(i.from, i.to).startsWith('The sky'))!;
  assert.equal(sky.verdict, 'unverifiable');
  assert.equal(sky.fix, '');
  assert.ok(items.find((i) => content.slice(i.from, i.to) === 'Water is wet.')!.ok);
  assert.deepEqual(events.at(-1), {
    type: 'done',
    overall: 'misleading',
    summary: 'Two claims need fixing.',
    dropped: 1,
  });
  assert.ok(events.some((e) => e.type === 'notice' && /Double-checking 1 of 3/.test(e.text)));
});

test('a check hands the model the exact arithmetic first', async () => {
  const content = 'Net benefit = $4.83M − $2.74M = $2.56M, which is great.';
  const { llm, provider } = fakeLLM({ stream: () => chunks('{"items":[],"overall":"accurate","summary":"ok"}') });
  await collect(check(llm, { content, from: 0, to: content.length, lens: 'logic' }));
  assert.match(lastUser(provider.requests[0]!), /WRONG: \$4\.83M − \$2\.74M = \$2\.09M/);
});

test('review notes stream in, pinned to their passages; made-up quotes are dropped', async () => {
  const content = `${'Our team writes everything down. '.repeat(4)}In today's fast-paced world, it is very important. We ship weekly and it works for us most of the time.`;
  const answer = JSON.stringify({
    summary: 'Clear, but padded.',
    notes: [
      { quote: "In today's fast-paced world", category: 'style', issue: 'Cliché.', suggestion: 'Today' },
      { quote: 'a sentence that is not there', category: 'clarity', issue: 'x', suggestion: '' },
      { quote: 'it is very important', category: 'nonsense', issue: 'Filler.', suggestion: 'it matters' },
    ],
  });
  const { llm } = fakeLLM({ stream: () => chunks(answer, 11), loaded: false });
  const events = await collect(review(llm, { content }));
  assert.equal(events[0]!.type, 'notice', 'a model still loading is explained');
  assert.deepEqual(events[1], { type: 'summary', text: 'Clear, but padded.' });
  const notes = events.flatMap((e) => (e.type === 'note' ? [e.note] : []));
  assert.equal(notes.length, 2);
  assert.equal(content.slice(notes[0]!.from, notes[0]!.to), "In today's fast-paced world");
  assert.equal(notes[1]!.category, 'clarity', 'an unknown category becomes clarity');
  assert.deepEqual(events.at(-1), { type: 'done', found: 2 });
  await assert.rejects(collect(review(llm, { content: 'Too short.' })), /Write a little more/);
});

test('a rewrite comes back as the few spots that changed, each with its warning', async () => {
  const text = 'Revenue grew 14.5% last year, and margins held steady.';
  const { llm } = fakeLLM({
    stream: () => chunks('Here is the rewrite: Revenue rose 15% last year, and margins held steady.'),
  });
  const done = (await collect(rewrite(llm, { text, action: 'improve' }))).at(-1)!;
  assert.equal(done.type, 'done');
  if (done.type !== 'done') return;
  assert.equal(done.text, 'Revenue rose 15% last year, and margins held steady.');
  assert.equal(applyHunks(text, done.changes), done.text);
  assert.ok(done.changes.some((c) => c.warning === 'Check: 14.5% → 15%'));
  // Half a rewrite would delete the rest of the passage: refused.
  const cut = fakeLLM({ stream: () => ['Revenue rose'], truncated: true });
  await assert.rejects(collect(rewrite(cut.llm, { text, action: 'shorten' })), /too long to rewrite/);
});

test('autocomplete is tidied to fit the cursor', async () => {
  const { llm, provider } = fakeLLM({ stream: () => ['value privacy.', ' And more.'] });
  const done = (await collect(complete(llm, { before: 'people who' }))).at(-1);
  assert.deepEqual(done, { type: 'done', text: ' value privacy.', truncated: false });
  assert.deepEqual(provider.requests[0]!.stop, ['\n\n']);
});

test('a separate writer model that won’t start is replaced by the quick one', async () => {
  const { llm } = fakeLLM(
    { stream: (req) => (req.model === 'writer-model' ? 'hang' : ['Drafted by quick.']) },
    { quick: 'quick-model', writer: 'writer-model' },
  );
  const gen = streamText(llm, [{ role: 'user', content: 'draft' }], { role: 'writer', firstWordMs: 20 });
  const events = [];
  let r = await gen.next();
  while (!r.done) {
    events.push(r.value);
    r = await gen.next();
  }
  assert.equal(r.value, 'Drafted by quick.');
  assert.ok(
    events.some(
      (e) =>
        e.type === 'notice' &&
        /writer-model is taking too long to start — writing with quick-model instead/.test(e.text),
    ),
  );
});

test('structured answers are normalised into safe shapes', async () => {
  assert.deepEqual(
    normaliseOutline({ title: ' T ', sections: [{ heading: 'A', points: ['x', 3, ''] }, { heading: '' }, 'junk'] }),
    { title: 'T', sections: [{ heading: 'A', points: ['x'] }] },
  );
  const { llm } = fakeLLM({
    complete: (req) => {
      const q = lastUser(req);
      if (q.includes('headline'))
        return '<think>…</think>{"headlines":[{"text":"One","style":"direct"},{"style":"x"}]}';
      if (q.includes('Plan an article')) return '{"title":"T","sections":[{"heading":"Intro","points":["a"]}]}';
      return '{"description":"d","slug":"Hello World!","tags":["a","",7],"excerpt":"e","social":"s"}';
    },
  });
  assert.deepEqual(await headlines(llm, { title: 'x' }), [{ text: 'One', style: 'direct' }]);
  assert.equal((await outline(llm, { title: 'Why write' })).sections[0]!.heading, 'Intro');
  await assert.rejects(outline(llm, {}), /what the article is about/);
  const m = await meta(llm, { content: 'word '.repeat(80) });
  assert.equal(m.slug, 'hello-world');
  assert.deepEqual(m.tags, ['a']);
});
