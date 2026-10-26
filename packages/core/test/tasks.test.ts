// The AI tasks, run against a scripted model: what reaches the writer, and
// what never should.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  nextSentenceOk,
  nextSentenceSpot,
  notesProgress,
  paragraphLength,
  paragraphVerdict,
} from '../src/autocomplete.ts';
import { applyHunks } from '../src/diff.ts';
import * as core from '../src/index.ts';
import { sectionAt } from '../src/outline.ts';
import {
  completeMessages,
  judgeMessages,
  REWRITES,
  THINK_KINDS,
  type ThinkKind,
  thinkMessages,
} from '../src/prompts.ts';
import { check } from '../src/tasks/check.ts';
import { InputError } from '../src/tasks/common.ts';
import { edit } from '../src/tasks/edit.ts';
import { nextSentence } from '../src/tasks/next.ts';
import { headlines, meta, normaliseOutline, outline } from '../src/tasks/plan.ts';
import { review } from '../src/tasks/review.ts';
import { think } from '../src/tasks/think.ts';
import { rewrite } from '../src/tasks/write.ts';
import { tidyCompletion } from '../src/tidy.ts';
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
  assert.deepEqual(events.at(-1), { type: 'done', count: 3, missed: 1, declined: '' });
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

// ─────────────────────────────────────────────────────────── you write

test('Margin has no way to write the author’s prose', () => {
  for (const name of ['draft', 'continueWriting', 'draftMessages', 'continueMessages', 'tidySectionBody']) {
    assert.ok(!(name in core), `${name} must not exist`);
  }
  assert.ok(!('expand' in REWRITES), 'no rewrite adds prose the author didn’t write');
});

test('thinking aids ask for coach notes, never prose', () => {
  const [system, user] = thinkMessages({
    kind: 'shape',
    title: 'Why small teams write things down',
    heading: 'Why pain matters',
    notes: ['Pain is a signal'],
    outline: ['Why pain matters', 'What to write down'],
    before: 'Most small teams run on talk.',
  });
  assert.match(system!.content, /NEVER write the author's prose/);
  assert.match(user!.content, /the section under the heading "Why pain matters"/);
  assert.match(user!.content, /- Pain is a signal/);
  assert.match(user!.content, /Never write sentences the author could paste into the article/);
  // Every kind builds a prompt that names each of its groups, in order.
  for (const kind of Object.keys(THINK_KINDS) as ThinkKind[]) {
    const content = thinkMessages({ kind })[1]!.content;
    const labels = THINK_KINDS[kind].groups.map(([label]) => content.indexOf(`"${label}"`));
    assert.ok(
      labels.every((i, n) => i > 0 && (n === 0 || i > labels[n - 1]!)),
      kind,
    );
  }
});

test('think returns tidy groups of notes from the coach model', async () => {
  const { llm, provider } = fakeLLM(
    {
      complete: () =>
        JSON.stringify({
          groups: [
            { label: 'The point', items: ['Pain tells you where the process breaks', ''] },
            { label: '', items: ['orphan'] },
            { label: 'Ask yourself', items: [] },
            { label: 'Steps of the argument', items: ['one', 2, 'two'] },
          ],
        }),
    },
    { quick: 'quick-model', coach: 'coach-model' },
  );
  assert.deepEqual(await think(llm, { kind: 'shape', heading: 'Why pain matters' }), [
    { label: 'The point', items: ['Pain tells you where the process breaks'] },
    { label: 'Steps of the argument', items: ['one', 'two'] },
  ]);
  assert.equal(provider.requests[0]!.model, 'coach-model');
  await assert.rejects(think(llm, { kind: 'write-it-for-me' as ThinkKind }), InputError);
  const empty = fakeLLM({ complete: () => '{"groups":[]}' });
  await assert.rejects(think(empty.llm, { kind: 'next' }), /No notes came back/);
});

test('edit, don’t write: from-scratch requests and paragraphs of new words never reach the text', async () => {
  // Declined before the model is even asked.
  const { llm, provider } = fakeLLM({ stream: () => chunks('{"edits":[],"declined":""}') });
  const declined = await collect(edit(llm, { text: passage, instruction: 'write two more paragraphs about athletes' }));
  assert.deepEqual(declined, [
    { type: 'done', count: 0, missed: 0, declined: 'That asks for new writing, not an edit.' },
  ]);
  assert.equal(provider.requests.length, 0);

  // A request that slips past, answered with a new paragraph: dropped.
  const story = JSON.stringify({
    edits: [
      {
        type: 'insert_after',
        anchor: 'Last para here.',
        text: 'Take Serena Williams, who trained for years before she won anything at all.',
      },
    ],
    declined: '',
  });
  const slipped = fakeLLM({ stream: () => chunks(story, 9) });
  const events = await collect(edit(slipped.llm, { text: passage, instruction: 'tell the story of a champion' }));
  assert.ok(!events.some((e) => e.type === 'edit'));
  assert.deepEqual(events.at(-1), {
    type: 'done',
    count: 0,
    missed: 0,
    declined: 'That would mean writing new material, not editing what’s there.',
  });

  // The model's own reason is passed on.
  const own = fakeLLM({
    stream: () => chunks('{"edits":[],"declined":"That needs a new section, which is yours to write."}'),
  });
  const done = (await collect(edit(own.llm, { text: passage, instruction: 'make this cover pricing too' }))).at(-1);
  assert.deepEqual(done, {
    type: 'done',
    count: 0,
    missed: 0,
    declined: 'That needs a new section, which is yours to write.',
  });
});

// ─────────────────────────────────────────────────────────── the next logical sentence

test('a suggestion is asked for only after a finished sentence at the end of prose', () => {
  const at = (text: string) => nextSentenceSpot(text, text.length);
  assert.ok(at('Every goal worth having hurts.'));
  assert.ok(at('He said it was “fine.”'));
  assert.ok(!at('Every goal worth having'), 'never mid-sentence');
  assert.ok(!at('## Why pain matters.'), 'never in a heading');
  assert.ok(!at('- Short note.'), 'too short to be prose');
  assert.ok(!at('| Year 1 | $910K. |'), 'never in a table');
  assert.ok(!at('```\nconsole.log("this is a long enough line.");'), 'never in code');
  const middle = 'First sentence is long enough. Second one too.';
  assert.ok(!nextSentenceSpot(middle, middle.indexOf(' Second')), 'never while editing inside a line');
  const doc = '# T\n\n## Why pain matters\n\n- Pain is a signal\n\nPain tells you where to look.';
  assert.equal(sectionAt(doc, doc.length)?.heading, 'Why pain matters');
  assert.deepEqual(sectionAt(doc, doc.length)?.points, ['Pain is a signal']);
  assert.equal(sectionAt(doc, 2), undefined, 'the title is not a section');
});

test('the next sentence comes only after a verdict: the judge quotes, code decides', () => {
  // The judge only quotes; a part counts as done only if its quote is really there.
  assert.match(judgeMessages({ before: 'x' })[0]!.content, /Do not write or suggest anything/);
  const para3 =
    'Most advice is about control. Control only works while you are in the room. So explain more and command less. ';
  const all = {
    point: 'Most advice is about control.',
    support: 'Control only works while you are in the room.',
    meaning: 'So explain more and command less.',
  };
  assert.equal(paragraphVerdict(para3, all).complete, true);
  const invented = { ...all, meaning: 'Therefore children thrive when trusted.' };
  assert.equal(paragraphVerdict(para3, invented).missing, 'what it means — why it matters or what follows');
  assert.equal(paragraphVerdict(para3, 'not even an object').missing, 'its point, stated plainly');
  assert.match(
    completeMessages({ before: para3, missing: 'support for its point' })[1]!.content,
    /missing support for its point/,
  );
  assert.match(
    completeMessages({ before: 'It hurts.', heading: 'Why', notes: ['pain signals growth'] })[1]!.content,
    /pain signals growth[\s\S]*The paragraph being written/,
  );
  const progress = notesProgress(
    ['every goal has its own discomfort', 'you choose which discomfort to live with'],
    'Every goal worth having comes with its own kind of discomfort.',
  );
  assert.deepEqual(progress, { covered: [true, false], next: 'you choose which discomfort to live with' });
  assert.equal(tidyCompletion('it hurts. And then more.', 'Every goal '), 'it hurts.');
  assert.equal(tidyCompletion('So choose it. Then more.', 'Every goal hurts.'), ' So choose it.');
});

test('the next sentence stops when it would only repeat or drone on', () => {
  const para =
    'This helped me recognize that parenting is about connection. This realization allowed me to shift from disciplinarian to partner. This understanding transformed how I approached discipline. ';
  // "This …" a fourth time is dropped…
  assert.equal(nextSentenceOk(para, 'This shift also allowed me to create a more open environment.'), false);
  // …so is saying the same thing again in other words…
  assert.equal(
    nextSentenceOk(
      'Parenting is about connection, not control. ',
      'Parenting is really about connection rather than control.',
    ),
    false,
  );
  // …and "nothing" is a fine answer.
  assert.equal(nextSentenceOk(para, ''), false);
  // A new step, opened differently, earns its place.
  assert.equal(
    nextSentenceOk(para, 'Punishment had taught my son to hide mistakes; curiosity taught him to bring them to me.'),
    true,
  );
  // The prompt names the opener to avoid.
  assert.match(completeMessages({ before: para })[1]!.content, /Don't begin with "This"/);
  // Only the paragraph being written is judged; earlier ones are context.
  assert.match(
    completeMessages({ before: 'Old point.\n\nNew point. ' })[1]!.content,
    /Earlier in the article:\n<<<\nOld point\.[\s\S]*The paragraph being written:\n<<<\nNew point\./,
  );
  assert.equal(paragraphLength('A. B.\n\nOne. Two. Three. '), 3);
});

test('nextSentence asks the model only when it should, and writes only what is missing', async () => {
  const judgeAll = JSON.stringify({
    idea: 'control vs trust',
    point: 'Most advice is about control.',
    support: 'Control only works while you are in the room.',
    meaning: 'So explain more and command less.',
  });
  const para3 =
    'Most advice is about control. Control only works while you are in the room. So explain more and command less.';

  // Mid-sentence, or a long paragraph: no model call at all.
  const quiet = fakeLLM({ complete: () => judgeAll });
  assert.deepEqual(await nextSentence(quiet.llm, { before: 'Most advice is about' }), { complete: false, next: '' });
  assert.deepEqual(await nextSentence(quiet.llm, { before: 'One. Two. Three. Four. Five. Six.' }), {
    complete: true,
    next: '',
  });
  assert.equal(quiet.provider.requests.length, 0);

  // A paragraph that has made its point: one call, the judge's, and nothing suggested.
  const made = fakeLLM({ complete: () => judgeAll, stream: () => ['Should never be asked.'] });
  assert.deepEqual(await nextSentence(made.llm, { before: para3 }), {
    complete: true,
    idea: 'control vs trust',
    next: '',
  });
  assert.equal(made.provider.requests.length, 1);

  // Missing its meaning: the writing call is told exactly that, and is steered by the section.
  const judgeTwo = JSON.stringify({
    idea: 'control',
    point: 'Most advice is about control.',
    support: 'Control only works while you are in the room.',
    meaning: '',
  });
  const two = 'Most advice is about control. Control only works while you are in the room.';
  const writes = fakeLLM({
    complete: () => judgeTwo,
    stream: () => [' So explain more', ' and command less. Then more.'],
  });
  const out = await nextSentence(writes.llm, {
    before: two,
    heading: 'Trust',
    notes: Array.from({ length: 20 }, (_, i) => `note ${i}`),
  });
  assert.deepEqual(out, {
    complete: false,
    idea: 'control',
    missing: 'what it means — why it matters or what follows',
    next: ' So explain more and command less.',
  });
  const prompt = lastUser(writes.provider.requests[1]!);
  assert.match(prompt, /missing what it means/);
  assert.ok(prompt.includes('note 11') && !prompt.includes('note 12'), 'at most 12 notes');

  // A suggestion that only restates is dropped.
  const echo = fakeLLM({
    complete: () => judgeTwo,
    stream: () => ['Control only works while you are really in the room.'],
  });
  assert.equal((await nextSentence(echo.llm, { before: two })).next, '');
});
