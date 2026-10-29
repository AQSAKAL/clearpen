// The AI tasks, run against a scripted model: what reaches the writer, and
// what never should.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  articleOpening,
  CODE_LEAD_IN_MISSING,
  commandOk,
  copiesSecret,
  describesExample,
  EXAMPLE_LEAD_IN_MISSING,
  EXAMPLES_LEAD_IN_MISSING,
  echoes,
  endsCodeLeadIn,
  endsExampleLeadIn,
  endsLeadIn,
  endsQuestionLeadIn,
  LEAD_IN_MISSING,
  madeUpAboutReal,
  maskSecrets,
  nextSentenceOk,
  nextSentenceSpot,
  notAQuery,
  notesProgress,
  paragraphLength,
  paragraphVerdict,
  QUESTION_LEAD_IN_MISSING,
} from '../src/autocomplete.ts';
import { runChecks } from '../src/checks.ts';
import { applyHunks } from '../src/diff.ts';
import * as core from '../src/index.ts';
import { heldBack, judgedParagraphs } from '../src/notes.ts';
import { sectionAt } from '../src/outline.ts';
import {
  completeMessages,
  judgeMessages,
  questionMessages,
  REWRITES,
  THINK_KINDS,
  type ThinkKind,
  thinkMessages,
} from '../src/prompts.ts';
import { check } from '../src/tasks/check.ts';
import { InputError } from '../src/tasks/common.ts';
import { edit } from '../src/tasks/edit.ts';
import { nextSentence, nextSentenceStream } from '../src/tasks/next.ts';
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

test('an edit that throws the passage away is redone as a rewrite, unless deleting was the ask', async () => {
  const wordy =
    "In today's fast-paced world, it is very important for writers to basically make sure that the things they write are understood.";
  const trimmed = 'It is important for writers to make sure that the things they write are understood.';
  const deleteAll = JSON.stringify({ edits: [{ type: 'delete', anchor: wordy, text: '' }], declined: '' });
  // The edits request has a schema; the rewrite fallback doesn't.
  const { llm, provider } = fakeLLM({ stream: (req) => chunks(req.format ? deleteAll : trimmed) });

  const events = await collect(edit(llm, { text: wordy, instruction: 'cut the filler words' }));
  const edits = events.filter((e) => e.type === 'edit');
  assert.equal(provider.requests.length, 2, 'asked again as a rewrite');
  assert.ok(edits.length > 1, 'several small cuts, not one deletion');
  assert.equal(applyHunks(wordy, edits), trimmed);

  const asked = await collect(edit(llm, { text: wordy, instruction: 'delete this paragraph' }));
  assert.deepEqual(
    asked.filter((e) => e.type === 'edit'),
    [{ type: 'edit', from: 0, to: wordy.length, insert: '' }],
  );
  assert.ok(core.asksToDelete('remove the last two sentences'));
  assert.ok(!core.asksToDelete('cut the filler words'));
  assert.ok(core.removesTooMuch(wordy, wordy, ''));
  assert.ok(!core.removesTooMuch(wordy, 'basically ', ''));
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

test('review judges each paragraph before its notes, and holds sentence notes back where the point is not yet made', async () => {
  const made =
    'Most advice is about control. Control only works while you are in the room. So explain more and command less.';
  const thin = 'We will utilise the new tool prior to launch. The team made a decision about it last week.';
  const content = `# Title\n\n${made}\n\n${thin}\n\n- A list item has no point of its own to make.\n\nOne sentence alone is a beat, not a paragraph to judge.`;
  // Code numbers the paragraphs; the model only names them.
  assert.deepEqual(
    judgedParagraphs(content).map((p) => [content.slice(p.from, p.to), p.opening]),
    [
      [made, 'Most advice is about control.'],
      [thin, 'We will utilise the new tool prior to launch.'],
    ],
  );
  const answer = JSON.stringify({
    summary: 'The first paragraph lands; the second only asserts.',
    unfinished: [
      { paragraph: 2, missing: 'A reason to believe the tool is worth it.' },
      { paragraph: 2, missing: 'named twice' },
      { paragraph: 9, missing: 'no such paragraph' },
    ],
    notes: [
      { quote: 'explain more and command less', category: 'style', issue: 'Tired.', suggestion: '' },
      {
        quote: 'made a decision about it',
        category: 'clarity',
        issue: 'Action in a noun.',
        suggestion: 'decided on it',
      },
      { quote: 'We will utilise the new tool', category: 'structure', issue: 'Nothing supports this.', suggestion: '' },
    ],
  });
  const { llm, provider } = fakeLLM({ stream: () => chunks(answer, 11) });
  const events = await collect(review(llm, { content }));
  const prompt = lastUser(provider.requests[0]!);
  assert.match(prompt, /1\. Most advice is about control\.\n2\. We will utilise the new tool prior to launch\.\n/);
  assert.doesNotMatch(prompt, /\n3\. /);
  assert.match(prompt, /"unfinished": the numbered paragraphs/);
  // One verdict, after the summary and before any note, mapped onto the draft.
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['summary', 'unfinished', 'note', 'note', 'note', 'done']);
  const unfinished = events.flatMap((e) => (e.type === 'unfinished' ? [e.paragraphs] : []))[0]!;
  assert.deepEqual(
    unfinished.map((p) => ({ text: content.slice(p.from, p.to), missing: p.missing })),
    [{ text: thin, missing: 'a reason to believe the tool is worth it' }],
  );
  // The style note on the finished paragraph shows; the clarity note on the unfinished one is held; structure never is.
  const notes = events.flatMap((e) => (e.type === 'note' ? [e.note] : []));
  assert.deepEqual(
    notes.map((n) => [n.quote, n.held ?? false]),
    [
      ['explain more and command less', false],
      ['made a decision about it', true],
      ['We will utilise the new tool', false],
    ],
  );
  // Clearpen's own findings follow the same rule, by category.
  const plain = runChecks(content).findings.find((f) => f.kind === 'plain')!;
  assert.equal(content.slice(plain.from, plain.to), 'utilise');
  assert.ok(heldBack(unfinished, plain));
  assert.ok(!heldBack(unfinished, { ...plain, category: 'numbers' }), 'an exact finding is never held');
  assert.ok(!heldBack(unfinished, { from: 0, to: 5, category: 'clarity' }), 'only inside the paragraph');
});

test('a paragraph that has made its point keeps its sentence notes, even when the model skips the verdict', async () => {
  const content = `${'Our team writes everything down. '.repeat(4)}In today's fast-paced world, it is very important. We ship weekly and it works for us most of the time.`;
  const note = { quote: "In today's fast-paced world", category: 'style', issue: 'Cliché.', suggestion: 'Today' };
  for (const answer of [
    JSON.stringify({ summary: 'Fine.', unfinished: [], notes: [note] }),
    // An answer with no verdict at all: nothing is held, and the margin isn't kept waiting.
    JSON.stringify({ summary: 'Fine.', notes: [note] }),
  ]) {
    const { llm } = fakeLLM({ stream: () => chunks(answer, 9) });
    const events = await collect(review(llm, { content }));
    assert.deepEqual(
      events.map((e) => e.type),
      ['summary', 'unfinished', 'note', 'done'],
    );
    assert.deepEqual(events.flatMap((e) => (e.type === 'unfinished' ? [e.paragraphs] : []))[0], []);
    assert.equal(events.flatMap((e) => (e.type === 'note' ? [e.note] : []))[0]!.held, undefined);
  }
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

test('Clearpen has no way to write the author’s prose', () => {
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
  const six = 'One here. Two here. Three here. Four here. Five here. Six here.';
  assert.equal(nextSentenceSpot(six, six.length), false, 'six sentences: the paragraph is done');
  assert.equal(nextSentenceSpot(six.slice(0, -10), six.length - 10), true);
});

test('the next sentence comes only after a verdict: the judge names sentences, code decides', () => {
  assert.match(judgeMessages({ before: 'x' })[0]!.content, /Do not write or suggest anything/);
  const para3 =
    'Most advice is about control. Control only works while you are in the room. So explain more and command less. ';
  // The judge is shown the paragraph numbered, and answers with numbers…
  assert.match(
    judgeMessages({ before: `Earlier.\n\n${para3}` })[1]!.content,
    /1\. Most advice is about control\.\n2\. Control[\s\S]*3\. So explain/,
  );
  assert.equal(paragraphVerdict(para3, { point: 1, support: 2, meaning: 3 }).complete, true);
  // …and a number that names no sentence, or 0, doesn't count.
  assert.equal(
    paragraphVerdict(para3, { point: 1, support: 2, meaning: 4 }).missing,
    'what it means — why it matters or what follows',
  );
  assert.match(paragraphVerdict(para3, { point: 1, support: 0, meaning: 3 }).missing ?? '', /^support for its point/);
  assert.equal(paragraphVerdict(para3, { point: '1', support: '2', meaning: '3' }).complete, true);
  // Quotes still work; a part counts as done only if its quote is really there.
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
  const judgeAll = JSON.stringify({ point: 1, support: 2, meaning: 3 });
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
  assert.deepEqual(await nextSentence(made.llm, { before: para3 }), { complete: true, next: '' });
  assert.equal(made.provider.requests.length, 1);

  // Missing its meaning: the writing call is told exactly that, and is steered by the section.
  const judgeTwo = JSON.stringify({ point: 1, support: 2, meaning: 0 });
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

test('nextSentenceStream gives the verdict first, then the sentence as it is written', async () => {
  const two = 'Most advice is about control. Control only works while you are in the room.';
  const writes = fakeLLM({
    complete: () => JSON.stringify({ point: 1, support: 2, meaning: 0 }),
    stream: () => [' So explain', ' more and', ' command less.', ' Then a second', ' sentence.'],
  });
  const events = await collect(nextSentenceStream(writes.llm, { before: two }));
  assert.deepEqual(events[0], {
    type: 'verdict',
    complete: false,
    missing: 'what it means — why it matters or what follows',
  });
  assert.deepEqual(
    events.filter((e) => e.type === 'text').map((e) => e.text),
    [' So explain', ' So explain more and', ' So explain more and command less.'],
  );
  assert.deepEqual(events.at(-1), { type: 'done', next: ' So explain more and command less.' });
  // One sentence is all that's wanted: the model is stopped once it's written.
  assert.equal(writes.provider.requests[1]!.signal?.aborted, true);
});

test('a lead-in ending in a colon skips the judge and gets what it introduces', async () => {
  assert.ok(endsLeadIn('A shared inbox fixes three things:'));
  assert.ok(endsLeadIn('It fixes “three things”: '));
  assert.ok(!endsLeadIn('## Three things:'), 'headings are the writer’s');
  assert.ok(!endsLeadIn('We met at 10:'));
  assert.ok(!endsLeadIn('It fixes three things.'));

  const writes = fakeLLM({
    complete: () => JSON.stringify({ point: 1, support: 2, meaning: 3 }),
    stream: () => ['\n- Requests reach', ' whoever is free first.', '\n- More'],
  });
  const events = await collect(
    nextSentenceStream(writes.llm, { before: 'Old point.\n\nA shared inbox fixes three things:' }),
  );
  assert.deepEqual(events[0], { type: 'verdict', complete: false, missing: LEAD_IN_MISSING });
  assert.deepEqual(events.at(-1), { type: 'done', next: ' Requests reach whoever is free first.' });
  // No judge: the only call is the writing one, told what the colon promises.
  assert.equal(writes.provider.requests.length, 1);
  assert.match(lastUser(writes.provider.requests[0]!), /missing what the colon at its end introduces/);
});

test('a paragraph that only asks skips the judge and gets its answer from the text before it', async () => {
  const shown = 'One leaked string, verbatim:\n\nmysql://app.root:B2Bqr2e3W887JYkODVju@db.example.com:4000/x';
  assert.ok(endsQuestionLeadIn(`${shown}\n\nWhat can we see here?`));
  assert.ok(endsQuestionLeadIn(`${shown}\n\nWhat can we see here? And what does it say about us? `));
  assert.ok(!endsQuestionLeadIn('What can we see here?'), 'nothing before it to answer from');
  assert.ok(!endsQuestionLeadIn('## Leaks\n\nWhat can we see here?'), 'a heading is not text to answer from');
  assert.ok(!endsQuestionLeadIn(`${shown}\n\nIt failed. Why?`), 'a paragraph with a point of its own is judged');
  assert.ok(!endsQuestionLeadIn(`${shown}\n\n## What can we see here?`), 'headings are the writer’s');
  assert.ok(!endsQuestionLeadIn(`${shown}\n\n“Did you see that?”`), 'a line of dialogue is a character’s');

  // A suggestion never copies a key or password out of the text…
  assert.ok(copiesSecret(shown, 'The password B2Bqr2e3W887JYkODVju sits in plain text.'));
  // …though it may name what the text shows.
  assert.ok(!copiesSecret(shown, 'The `root` user and its password travel together in one string.'));
  assert.ok(!copiesSecret(shown, 'It reached gateway02 through tidbcloud before anyone noticed.'));
  assert.equal(nextSentenceOk(shown, 'Anyone can log in with B2Bqr2e3W887JYkODVju as root.'), false);
  // The model only ever sees it masked; carrying the mask over is copying it too.
  assert.match(maskSecrets(shown), /mysql:\/\/app\.root:<redacted>@db\.example\.com:4000\/x$/);
  assert.equal(maskSecrets('APID-11887 hit gateway02 and tidbcloud'), 'APID-11887 hit gateway02 and tidbcloud');
  assert.ok(copiesSecret(shown, 'The string `mysql://<redacted>` gives it away.'));

  const before = `${shown}\n\nWhat can we see here?`;
  const writes = fakeLLM({
    complete: () => 'never asked',
    stream: () => [' The `root` user', ' and its password travel in one string.', ' More.'],
  });
  const events = await collect(nextSentenceStream(writes.llm, { before, heading: 'Leaks', notes: ['root is shared'] }));
  assert.deepEqual(events[0], { type: 'verdict', complete: false, missing: QUESTION_LEAD_IN_MISSING });
  assert.deepEqual(events.at(-1), { type: 'done', next: ' The `root` user and its password travel in one string.' });
  // No judge: one call, to the question prompt, with the text before it and the section's notes.
  assert.equal(writes.provider.requests.length, 1);
  const req = writes.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /So far it only asks a question/);
  assert.match(req.messages[0]!.content, /Never copy a password, key, token or ID/);
  assert.match(
    lastUser(req),
    /The text before the question:\n<<<\nOne leaked string[\s\S]*mysql:\/\/app\.root:<redacted>@/,
  );
  assert.ok(!lastUser(req).includes('B2Bqr2e3W887JYkODVju'), 'the password never reaches the model');
  assert.match(lastUser(req), /The paragraph being written:\n<<<\nWhat can we see here\?\n>>>/);
  assert.match(lastUser(req), /notes for it:\n- root is shared/);
  assert.match(
    questionMessages({ before })[1]!.content,
    /Answer its question from the text before it, in one sentence\.$/,
  );

  // An answer that copies the password is dropped, and stopped before the password shows.
  const leaks = fakeLLM({ stream: () => ['The password ', 'B2Bqr2e3W887JYkODVju', ' is right there.'] });
  const leaked = await collect(nextSentenceStream(leaks.llm, { before }));
  assert.ok(!leaked.some((e) => e.type === 'text' && e.text.includes('B2Bq')));
  assert.deepEqual(leaked.at(-1), { type: 'done', next: '' });
  assert.equal(leaks.provider.requests[0]!.signal?.aborted, true);
  // A question that ends a paragraph with a point of its own is still judged.
  const judged = fakeLLM({ complete: () => JSON.stringify({ point: 1, support: 2, meaning: 3 }) });
  await nextSentence(judged.llm, { before: `${shown}\n\nIt failed for a reason. Nobody rotated the key. Why?` });
  assert.match(judged.provider.requests[0]!.messages[0]!.content, /Do not write or suggest anything/);
});

test('a suggestion knows what the article is about: the brief, the kind of piece, how it opens', async () => {
  const opening = 'The security issues found in systems are not technical. They are social.';
  // The opening is the first paragraph of prose, however far the cursor has come.
  assert.equal(articleOpening(`# Leaks\n\n${opening}\n\nMore.`), opening);
  assert.equal(articleOpening('```\ncode\n```\n\n| a | b |\n\nFirst prose.'), 'First prose.');
  assert.equal(articleOpening(''), '');
  assert.equal(articleOpening('x'.repeat(900)).length, 600);

  const brief = { topic: 'Application security', audience: 'engineers', notes: 'my research', length: '1500' };
  const prompt = completeMessages({
    before: `${opening}\n\nIt failed. `,
    brief: { ...brief, genre: 'scientific' },
    opening,
  })[1]!.content;
  assert.match(
    prompt,
    /What the author has said about the article:\nTopic: Application security\nAudience: engineers\n/,
  );
  assert.ok(!prompt.includes('my research') && !prompt.includes('1500'), 'not the research notes or the length');
  assert.match(prompt, /The reader is a reviewer/, 'who reads this kind of piece');
  assert.match(prompt, /How the article opens — its subject and argument:\n<<<\nThe security issues[^<]*social\.\n>>>/);
  // With nothing said, an article's reader; and the opening isn't repeated while it is being written.
  const first = completeMessages({ before: 'The security issues found. ', opening: 'The security issues found.' })[1]!
    .content;
  assert.match(first, /The reader is intelligent and busy/);
  assert.ok(!first.includes('How the article opens'));

  // The task passes both to the prompt that answers a question, the opening masked like the rest.
  const writes = fakeLLM({ stream: () => ['The `root` user is shared.'] });
  await nextSentence(writes.llm, {
    before: `${opening}\n\nmysql://app.root:B2Bqr2e3W887JYkODVju@db.example.com/x\n\nWhat can we see here?`,
    brief: { topic: 'Application security' },
    opening: `${opening} Key B2Bqr2e3W887JYkODVju.`,
  });
  const req = writes.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /as a specialist in the article's subject would/);
  assert.match(
    lastUser(req),
    /^Article title: \(untitled\)\n\nWhat the author has said about the article:\nTopic: Application security\n/,
  );
  assert.match(lastUser(req), /How the article opens[\s\S]*Key <redacted>\.\n>>>/);
  assert.ok(!lastUser(req).includes('B2Bqr2e3W887JYkODVju'), 'the password never reaches the model');
});

test('a lead-in that introduces a command gets the command, as inline code', async () => {
  assert.ok(endsCodeLeadIn('How to create an SSH key, use this CLI command:'));
  assert.ok(endsCodeLeadIn('SSH is: a protocol. To install it, run the following:'));
  assert.ok(endsCodeLeadIn('In the terminal:'));
  assert.ok(!endsCodeLeadIn('A shared inbox fixes three things:'));
  assert.ok(!endsCodeLeadIn('Run the numbers again:'));
  assert.ok(!endsCodeLeadIn('Use this command.'), 'a sentence, not a lead-in');
  // Only the clause the colon ends counts: code mentioned earlier on the line doesn't.
  assert.ok(!endsCodeLeadIn('The command failed. It failed for three reasons:'));

  // A command is a command — not a sentence of prose, and not a refusal.
  assert.ok(commandOk('ssh-keygen -t ed25519 -C "<you@example.com>"'));
  assert.ok(commandOk('ls'));
  assert.ok(commandOk('Get-ChildItem -Path C:\\ -Recurse'));
  assert.ok(!commandOk('The key pair ensures only authorized users can initiate a secure connection.'));
  assert.ok(!commandOk('Use the ssh-keygen tool.'));
  assert.ok(!commandOk("I'm not sure which command you mean."));
  assert.ok(!commandOk('nothing'));
  assert.ok(!commandOk(''));

  const before = 'How does SSH work: It establishes a secure channel. How to create an SSH key, use this CLI command:';
  const writes = fakeLLM({
    complete: () => 'never asked',
    stream: () => ['```bash\nssh-keygen', ' -t ed25519', ' -C "<you@example.com>"\n```'],
  });
  const events = await collect(nextSentenceStream(writes.llm, { before, title: 'SSH', heading: 'Keys' }));
  assert.deepEqual(events[0], { type: 'verdict', complete: false, missing: CODE_LEAD_IN_MISSING });
  // Streamed as inline code from the first chunk; the fence never shows.
  assert.deepEqual(
    events.filter((e) => e.type === 'text').map((e) => e.text),
    [' `ssh-keygen`', ' `ssh-keygen -t ed25519`', ' `ssh-keygen -t ed25519 -C "<you@example.com>"`'],
  );
  assert.deepEqual(events.at(-1), { type: 'done', next: ' `ssh-keygen -t ed25519 -C "<you@example.com>"`' });
  // No judge: one call, to the command prompt, with the section, at a low temperature.
  assert.equal(writes.provider.requests.length, 1);
  const req = writes.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /never invent a tool, a flag or an option/);
  assert.match(lastUser(req), /The section being written: "Keys"/);
  assert.match(lastUser(req), /introduces a command\. Write that one command and nothing else\./);
  assert.equal(req.temperature, 0.2);
  // One line is all that's wanted: the model is stopped once it's written.
  assert.equal(req.signal?.aborted, true);

  // A sentence where a command was asked for is dropped: code decides, not the prompt.
  const prose = fakeLLM({ stream: () => ['The key pair ensures only authorized users can connect.'] });
  assert.equal((await nextSentence(prose.llm, { before })).next, '');
  // A prompt sign copied from a terminal is not part of the command.
  const prompt = fakeLLM({ stream: () => ['$ ssh-keygen -t ed25519\n'] });
  assert.equal((await nextSentence(prompt.llm, { before })).next, ' `ssh-keygen -t ed25519`');
  // An ordinary lead-in still gets a sentence from the sentence prompt.
  const plain = fakeLLM({ stream: () => ['Requests reach whoever is free first.'] });
  await nextSentence(plain.llm, { before: 'A shared inbox fixes three things:' });
  assert.match(plain.provider.requests[0]!.messages[0]!.content, /Write ONE sentence/);
});

test('a lead-in that introduces an example gets the example itself, made up only when the author asks', async () => {
  const hyde = 'HyDE turns a query into a hypothetical document before matching it.';
  assert.deepEqual(endsExampleLeadIn(`${hyde}\n\nHere is an example of a generated response:`), {
    madeUp: true,
    many: false,
    kind: 'document',
    anchors: [],
  });
  assert.deepEqual(
    endsExampleLeadIn('Revenue rose. For example:'),
    { madeUp: false, many: false, kind: '', anchors: [] },
    'what is known',
  );
  assert.equal(endsExampleLeadIn('It fixes three things:'), null);
  // Several are wanted when the lead-in says so — "examples", "a variety of them like:".
  assert.deepEqual(endsExampleLeadIn(`${hyde}\n\nGenerated examples:`), {
    madeUp: true,
    many: true,
    kind: '',
    anchors: [],
  });
  assert.deepEqual(endsExampleLeadIn(`${hyde}\n\nNow HyDE will generate a variety of them like:`), {
    madeUp: true,
    many: true,
    kind: '',
    anchors: [],
  });
  // A search query is not code: "a query, for example…:" is an example, not a command.
  const query = `${hyde}\n\nYou create a query, for example to research financial results on earnings:`;
  assert.equal(endsCodeLeadIn(query), false);
  assert.deepEqual(endsExampleLeadIn(query), { madeUp: true, many: false, kind: 'query', anchors: [] });
  assert.ok(endsCodeLeadIn('Find the rows with this SQL query:'));

  // Made-up figures never go under a real company the author hasn't named; bare punctuation is no suggestion.
  assert.ok(madeUpAboutReal(hyde, 'Apple reported Q3 revenue of $94.7 billion.'));
  assert.ok(!madeUpAboutReal(hyde, 'Contoso reported Q3 revenue of $450M.'));
  assert.ok(
    !madeUpAboutReal('A synthetic Apple report:', 'Apple reported Q3 revenue of $94.7 billion.'),
    'the author named it',
  );
  assert.equal(nextSentenceOk(hyde, '"'), false);

  const before = `${hyde}\n\nHere is a synthetic example of a generated response:`;
  const writes = fakeLLM({ stream: () => [' Contoso reported Q3 revenue', ' of $450M, up 12%.', ' More.'] });
  const events = await collect(nextSentenceStream(writes.llm, { before }));
  assert.deepEqual(events[0], { type: 'verdict', complete: false, missing: EXAMPLE_LEAD_IN_MISSING });
  assert.deepEqual(events.at(-1), { type: 'done', next: ' Contoso reported Q3 revenue of $450M, up 12%.' });
  const req = writes.provider.requests[0]!;
  assert.match(
    req.messages[0]!.content,
    /Each example is only the thing itself, in double quotes: the generated document/,
  );
  assert.match(req.messages[0]!.content, /asked for a made-up example/);
  assert.match(req.messages[0]!.content, /never repeat one or reword it/);
  assert.equal(req.temperature, 0.6);
  assert.match(lastUser(req), /Write the new example its colon introduces — documents, the things themselves\.$/);
  // A plain example may not make anything up.
  const real = fakeLLM({ stream: () => ['Sales rose 4%.'] });
  await nextSentence(real.llm, { before: 'Revenue rose last year. For example:' });
  assert.match(real.provider.requests[0]!.messages[0]!.content, /never invent a figure, name or result/);
  // An invented example under a real company is dropped.
  const apple = fakeLLM({ stream: () => [' Apple reported Q3 revenue of $94.7 billion.'] });
  assert.equal((await nextSentence(apple.llm, { before })).next, '');
});

test('a lead-in that promises several gets a short list, and never an example the article already gives', async () => {
  const given =
    'Example 1 is: HyDE transforms "financial results on earnings" into a synthetic report for Contoso Corp stating Q3 revenue hit $42.5M with a net profit margin of 18%.';
  const before = `HyDE writes a hypothetical document first.\n\n${given}\n\nGenerated examples:`;
  // Something said already, word for word or nearly, is an echo; something new is not.
  assert.ok(
    echoes(
      before,
      'HyDE constructs a synthetic report for Contoso Corp stating Q3 revenue hit $42.5M with an 18% net profit margin.',
    ),
  );
  assert.ok(!echoes(before, 'Northwind Corp reported fourth-quarter sales of $3.1B, up 9% on a year earlier.'));
  // The same figures and a few of the same words are the same example, however reworded.
  assert.ok(
    echoes(
      before,
      'Contoso Corp Q3 revenue hit $42.5M with an 18% net profit margin, aligning closely with search results.',
    ),
  );
  assert.ok(!echoes(before, 'Northwind reported an 18% rise in sales.'), 'one figure in common is a coincidence');

  const lists = fakeLLM({
    stream: () => [
      'Here are three:\n',
      '- Northwind Corp reported Q4 sales of $3.1B, up 9%.\n',
      '- HyDE turns it into a synthetic report for Contoso Corp stating Q3 revenue hit $42.5M with an 18% net profit margin.\n',
      '- Fabrikam posted a Q2 loss of $12M on lower margins.\n',
      '- A fourth one.\n',
    ],
  });
  const events = await collect(nextSentenceStream(lists.llm, { before }));
  assert.deepEqual(events[0], { type: 'verdict', complete: false, missing: EXAMPLES_LEAD_IN_MISSING });
  // Three items, one a line, as a list — the one the article already gives taken out, and the next read in its place.
  assert.deepEqual(events.at(-1), {
    type: 'done',
    next: '\n- Northwind Corp reported Q4 sales of $3.1B, up 9%.\n- Fabrikam posted a Q2 loss of $12M on lower margins.\n- A fourth one.',
  });
  const req = lists.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /Write three, as a Markdown list/);
  assert.match(lastUser(req), /Write the three new examples its colon introduces — queries, the things themselves\.$/);
  assert.equal(req.signal?.aborted, true, 'stopped once three are written');

  // An ordinary suggestion that says again what a paragraph further up said is dropped too.
  const again = fakeLLM({
    complete: () => JSON.stringify({ point: 1, support: 0, meaning: 0 }),
    stream: () => [' HyDE transforms the query into a synthetic report for Contoso Corp with Q3 revenue of $42.5M.'],
  });
  assert.equal((await nextSentence(again.llm, { before: `${before.slice(0, -21)}\n\nIt works well. ` })).next, '');
});

test('an example is the thing itself — the query as typed, the document as written — of the kind asked for', async () => {
  const article =
    'You create a query, for example "financial results on earnings".\n\nHyDE turns it into a synthetic report.';
  // The lead-in names the kind; failing that, the article's own quoted example decides it — a few words are a query.
  assert.deepEqual(endsExampleLeadIn(`${article}\n\nExample queries:`)?.kind, 'query');
  assert.deepEqual(
    endsExampleLeadIn(`${article}\n\nSome synthetic examples of generated responses:`)?.kind,
    'document',
  );
  assert.deepEqual(endsExampleLeadIn(`${article}\n\nGenerated examples:`), {
    madeUp: true,
    many: true,
    kind: 'query',
    anchors: ['financial results on earnings'],
  });

  // Talking about an example isn't one, in quotes or not; a query is what someone types.
  assert.ok(describesExample('HyDE transforms "Q3 earnings" into a synthetic report for Contoso.'));
  assert.ok(describesExample('- "The model generates fabricated earnings data for Contoso."'));
  assert.ok(describesExample('Generated text depicting Jane Doe posting $38.7M.'));
  assert.ok(!describesExample('"Northwind Corp reported Q4 revenue of $75.2M."'));
  assert.ok(notAQuery('Jane Doe seeks quarterly revenue for Northwind Corp via HyDE'));
  assert.ok(!notAQuery('"Northwind Q4 2024 operating margin"'));
  assert.ok(!notAQuery('why did Contoso miss revenue estimates'));

  const before = `${article}\n\nGenerated examples:`;
  const lists = fakeLLM({
    stream: () => [
      '- "Northwind Q4 2024 operating margin"\n',
      '- "HyDE converts the query into a report for Contoso."\n',
      '- Jane Doe seeks quarterly revenue via HyDE\n',
      '- "why did Contoso miss revenue estimates"\n',
    ],
  });
  const out = await nextSentence(lists.llm, { before });
  // The queries stay, quotes and all; the description and the sentence about searching go.
  assert.equal(out.next, '\n- "Northwind Q4 2024 operating margin"\n- "why did Contoso miss revenue estimates"');
  const req = lists.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /Each example is only the thing itself, in double quotes: a search query/);
  assert.match(
    lastUser(req),
    /The article's own example, whose subject the new ones keep to: "financial results on earnings"/,
  );
  // Short as a query is, the article's own figures make it a copy.
  assert.ok(
    echoes(
      'Contoso Q3 revenue hit $42.5M with a net profit margin of 18%.',
      'Contoso Q3 revenue $42.5M net profit 18%',
    ),
  );
});
