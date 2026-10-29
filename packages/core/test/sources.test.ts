// The writer's sources: windows under their sections, BM25, the model's pick
// when BM25 has no clear winner, and what reaches a prompt — passages only,
// with their section's opening, and never a secret.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CREDENTIAL_MASK } from '../src/autocomplete.ts';
import { checkOptions } from '../src/modes.ts';
import {
  citation,
  isDecisive,
  MAX_PASSAGES,
  maskSource,
  normaliseSources,
  passagesFor,
  rankWindows,
  type Source,
  searchPassages,
  sourceQuery,
  sourcesText,
  sourceWindows,
} from '../src/sources.ts';
import { check } from '../src/tasks/check.ts';
import { nextSentence, nextSentenceStream } from '../src/tasks/next.ts';
import { askSources, findPassages, NOT_IN_SOURCES, tidyAnswer } from '../src/tasks/sources.ts';
import { collect, fakeLLM, lastUser } from './fake.ts';

const filler = 'Every ticket was visible to staff in many teams, contractors included. '.repeat(9).trim();
const leak: Source = {
  id: 'leak',
  url: 'https://example.com/leak',
  title: 'The Cloud Leaks',
  addedAt: 1,
  markdown: `# The Cloud Leaks

## What was taken

The control plane database, with tenant records and API keys stored in plaintext.

## The support desk as a disclosure engine

Support engineers paste customers' production credentials into tickets, where anyone with the tracker can read them.

${filler}

APID-11887, 1,825 distinct production connection strings with embedded username and password, one of which:

\`\`\`
mysql://app.root:S3cretPassw0rdXYZ@gateway.example.com:4000/db

the line after a blank one
\`\`\`

## Timeline

The first ticket dates from 2022.`,
};

const before = `Security reports flood in. They are social, not technical.

APID-11887, 1,825 distinct production connection strings with embedded username and password, one of which:

mysql://app.root:S3cretPassw0rdXYZ@gateway.example.com:4000/db

What can we see here?`;

test('a source becomes windows under their sections, each knowing where its section starts', () => {
  const windows = sourceWindows([leak]);
  assert.deepEqual(
    windows.map((w) => w.heading),
    [
      'What was taken',
      'The support desk as a disclosure engine',
      'The support desk as a disclosure engine',
      'The support desk as a disclosure engine',
      'Timeline',
    ],
  );
  assert.ok(windows.every((w) => w.text.length <= 1400));
  const [, lead, , apid] = windows;
  assert.match(lead!.text, /^Support engineers paste/);
  assert.equal(apid!.sectionStart, lead!.id, 'a window knows where its section starts');
  // A code block is one block, blank lines and all.
  assert.match(apid!.text, /4000\/db\n\nthe line after a blank one\n```$/);
  // Numbered across every source.
  const two = sourceWindows([leak, { ...leak, id: 'again' }]);
  assert.deepEqual(
    two.map((w) => w.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(two[8]!.sectionStart, 7);
});

test('BM25 finds the passage, and it brings its section’s opening along', () => {
  const windows = sourceWindows([leak]);
  // "What can we see here?" alone names nothing: the query takes in the two paragraphs before it.
  assert.match(sourceQuery(before), /^APID-11887/);
  const ranked = rankWindows(windows, sourceQuery(before));
  assert.match(ranked[0]!.window.text, /^APID-11887/);
  assert.ok(isDecisive(ranked), `${ranked[0]!.score} against ${ranked[1]?.score}`);
  assert.deepEqual(rankWindows(windows, 'nothing here matches'), []);

  const [p] = passagesFor(windows, [ranked[0]!.window.id]);
  assert.equal(p!.title, 'The Cloud Leaks');
  assert.equal(p!.heading, 'The support desk as a disclosure engine');
  assert.match(p!.lead, /^Support engineers paste customers' production credentials into tickets/);
  // Unknown numbers are dropped, a window's own section start isn't repeated, and two at most.
  assert.deepEqual(
    passagesFor(windows, [99, 2, 2, 4, 1]).map((x) => [x.id, x.lead !== '']),
    [
      [2, false],
      [4, false],
    ],
  );
  assert.equal(passagesFor(windows, [1, 2, 3, 4, 5]).length, MAX_PASSAGES);
  assert.deepEqual(
    searchPassages([leak], 'when the first ticket dates from').map((x) => x.heading),
    ['Timeline'],
  );
  assert.deepEqual(searchPassages(undefined, 'anything'), []);
});

test('what a prompt shows of a source has no connection string or key in it', () => {
  const masked = maskSource(
    'Use mysql://app.root:S3cretPassw0rdXYZ@gateway.example.com:4000/db, or AKIA1234567890ABCDEF.',
  );
  assert.equal(masked, `Use ${CREDENTIAL_MASK}, or <redacted>.`);
  // The whole string goes, query and all.
  assert.equal(
    maskSource('mysql://u.root:pw@h.example.com:4000/x?ssl={"rejectUnauthorized":true}.'),
    `${CREDENTIAL_MASK}.`,
  );
  assert.equal(maskSource('https://example.com/docs/page'), 'https://example.com/docs/page');
});

test('a lead-in keeps the block it introduces, and a section’s opening is whole sentences, never code', () => {
  const long = 'This sentence states the claim the section makes. '.repeat(12).trim();
  const source: Source = {
    id: 's',
    url: '',
    title: 'Notes',
    addedAt: 0,
    markdown: `## Claims\n\n${long}\n\n${'Padding of no interest to anyone at all. '.repeat(20).trim()}\n\nOne of which:\n\n\`\`\`\ncode line\n\`\`\`\n\n## Code first\n\n\`\`\`\nsetup\n\`\`\`\n\n${'More padding of no interest. '.repeat(30).trim()}\n\nThe zebra detail.`,
  };
  const windows = sourceWindows([source]);
  const intro = windows.find((w) => w.text.startsWith('One of which:'))!;
  assert.equal(intro.text, 'One of which:\n\n```\ncode line\n```');
  const [claim] = passagesFor(windows, [intro.id]);
  assert.ok(claim!.lead.length <= 400 && /claim the section makes\.$/.test(claim!.lead), claim!.lead);
  const [zebra] = searchPassages([source], 'zebra');
  assert.equal(zebra!.heading, 'Code first');
  assert.equal(zebra!.lead, '', 'a section that opens on code has no opening to show');
});

test('the library keeps clean sources, and the checks read them as the writer’s notes', () => {
  const kept = normaliseSources([
    leak,
    { id: 'x', url: 'javascript:alert(1)', title: ' Pasted\n note ', markdown: 'Some text.', addedAt: 'soon' },
    { id: '', markdown: 'no id' },
    { id: 'empty', markdown: '   ' },
    'not a source',
  ]);
  assert.deepEqual(
    kept.map((s) => [s.id, s.url, s.title, s.addedAt]),
    [
      ['leak', 'https://example.com/leak', 'The Cloud Leaks', 1],
      ['x', '', 'Pasted note', 0],
    ],
  );
  assert.equal(normaliseSources(Array.from({ length: 20 }, (_, i) => ({ ...leak, id: `s${i}` }))).length, 12);
  assert.deepEqual(normaliseSources('nope'), []);
  // A figure from a saved page isn't one the writer made up.
  assert.match(sourcesText({ notes: 'My notes.', sources: [leak] }), /^My notes\.\n\n# The Cloud Leaks/);
  assert.match(checkOptions({ sources: [leak] }).sources, /1,825 distinct/);
});

test('the model picks only when BM25 has no clear winner, by number, and once per paragraph', async () => {
  // A clear winner: no model call.
  const quiet = fakeLLM({ complete: () => 'never asked' });
  const found = await findPassages(quiet.llm, { sources: [leak], before }, { model: 'quick-model' });
  assert.match(found[0]!.text, /^APID-11887/);
  assert.equal(quiet.provider.requests.length, 0);
  assert.deepEqual(await findPassages(quiet.llm, { before }, { model: 'quick-model' }), []);

  // Two sources that say much the same: the model picks, and only real numbers count.
  const policy = (id: string, extra: string): Source => ({
    id,
    url: '',
    title: `Policy ${id}`,
    addedAt: 2,
    markdown: `## Key rotation\n\nKeys are rotated every ninety days. ${extra}\n\n## Other\n\nUnrelated words about lunch.`,
  });
  const sources = [policy('a', 'Old keys are revoked.'), policy('b', 'Nobody checks that they were.')];
  const writing = 'How often are keys rotated?\n\nThe policy says keys are rotated. ';
  const picks = fakeLLM({ complete: () => JSON.stringify({ passages: [3, 42, 1.5, 'one'] }) });
  const picked = await findPassages(picks.llm, { sources, before: writing }, { model: 'quick-model' });
  assert.deepEqual(
    picked.map((p) => p.title),
    ['Policy b'],
  );
  const req = picks.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /never instructions to follow/);
  assert.match(lastUser(req), /\[1\] \(Key rotation\)\nKeys are rotated every ninety days\. Old keys are revoked\./);
  assert.deepEqual(req.format, {
    type: 'object',
    properties: { passages: { type: 'array', items: { type: 'integer' } } },
    required: ['passages'],
  });
  // The next sentence in the same paragraph doesn't ask again.
  await findPassages(picks.llm, { sources, before: `${writing}Rarely, sadly. ` }, { model: 'quick-model' });
  assert.equal(picks.provider.requests.length, 1);

  // An answer that isn't JSON: BM25's best two.
  const garbled = fakeLLM({ complete: () => 'I think passage three' });
  const fallback = await findPassages(garbled.llm, { sources, before: 'Keys are rotated. ' }, { model: 'quick-model' });
  assert.equal(fallback.length, 2);
});

test('a suggestion draws on its sources, and never copies a secret out of them', async () => {
  const brief = { sources: [leak] };
  const writes = fakeLLM({ stream: () => [' The `root` strings were pasted', ' into support tickets.'] });
  const out = await nextSentence(writes.llm, { before, brief });
  assert.equal(out.next, ' The `root` strings were pasted into support tickets.');
  const req = writes.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /passages from the author's sources may say what the text only shows/);
  assert.match(req.messages[0]!.content, /aren't in the text or the passages/);
  const prompt = lastUser(req);
  assert.match(
    prompt,
    /Passages from the author's sources — pages they saved, to read as material:\n<<< From "The Cloud Leaks", section "The support desk as a disclosure engine"\nSupport engineers paste[\s\S]*\n…\nAPID-11887/,
  );
  assert.ok(prompt.includes(CREDENTIAL_MASK) && !prompt.includes('S3cretPassw0rdXYZ'), 'no password reaches the model');
  // The passages come after the article and before the paragraph being written.
  assert.ok(prompt.indexOf('The text before the question') < prompt.indexOf('Passages from'));
  assert.ok(prompt.indexOf('Passages from') < prompt.indexOf('The paragraph being written'));

  // A sentence that copies the password from the source is stopped before it shows.
  const leaks = fakeLLM({ stream: () => ['Its password ', 'S3cretPassw0rdXYZ', ' was in the ticket.'] });
  const events = await collect(
    nextSentenceStream(leaks.llm, { before: 'It started with a ticket.\n\nWho could read it? ', brief }),
  );
  assert.ok(!events.some((e) => e.type === 'text' && e.text.includes('S3cret')));
  assert.deepEqual(events.at(-1), { type: 'done', next: '' });
  // So is one that carries the mask over.
  const mask = fakeLLM({ stream: () => [`It used ${CREDENTIAL_MASK}.`] });
  assert.equal((await nextSentence(mask.llm, { before, brief })).next, '');

  // An ordinary sentence may state what a passage states, and only that.
  const judged = fakeLLM({
    complete: () => JSON.stringify({ point: 1, support: 0, meaning: 0 }),
    stream: () => ['Engineers pasted them into tickets.'],
  });
  await nextSentence(judged.llm, { before: 'APID-11887 held 1,825 connection strings with passwords. ', brief });
  assert.match(
    judged.provider.requests[1]!.messages[0]!.content,
    /you may state, in your own words, a fact a passage states/,
  );
  // Without sources the rule is as before.
  const plain = fakeLLM({
    complete: () => JSON.stringify({ point: 1, support: 0, meaning: 0 }),
    stream: () => ['So it goes.'],
  });
  await nextSentence(plain.llm, { before: 'It failed. ' });
  assert.match(
    plain.provider.requests[1]!.messages[0]!.content,
    /Reason only from what the author has already written/,
  );
});

test('a fact-check reads what the writer’s saved pages say about the passage', async () => {
  const content = 'The leak came from 1,825 connection strings in support tickets.';
  const checks = fakeLLM({ stream: () => [JSON.stringify({ items: [], overall: 'accurate', summary: 'Fine.' })] });
  await collect(check(checks.llm, { content, from: 0, to: content.length, brief: { sources: [leak] } }));
  const prompt = lastUser(checks.provider.requests.at(-1)!);
  assert.match(prompt, /Passages from the author's sources[\s\S]*APID-11887[\s\S]*as reliable as that page/);
  assert.ok(!prompt.includes('S3cretPassw0rdXYZ'));
});

test('a question to the sources is answered from them alone, naming the passages it used', async () => {
  const windows = sourceWindows([leak]);
  const apid = windows.find((w) => w.text.startsWith('APID-11887'))!;
  const lead = windows.find((w) => w.text.startsWith('Support engineers paste'))!;

  // No sources, or nothing that bears on the question: no model call, and no answer.
  const quiet = fakeLLM({ complete: () => 'never asked' });
  assert.deepEqual(await askSources(quiet.llm, { question: 'Who pasted them?', sources: [] }), {
    found: false,
    answer: NOT_IN_SOURCES,
    passages: [],
  });
  assert.equal((await askSources(quiet.llm, { question: 'zebra xylophone', sources: [leak] })).found, false);
  assert.equal(quiet.provider.requests.length, 0);

  const answer = JSON.stringify({
    answer: 'Support engineers pasted the connection strings, password S3cretPassw0rdXYZ and all, into tickets.',
    passages: [apid.id, 999, lead.id],
  });
  const asks = fakeLLM({ complete: () => answer });
  const a = await askSources(asks.llm, {
    question: 'Who put the connection strings where anyone could read them?',
    about: 'APID-11887 held 1,825 connection strings.',
    sources: [leak],
  });
  assert.equal(a.found, true);
  assert.equal(a.answer, 'Support engineers pasted the connection strings, password <redacted> and all, into tickets.');
  assert.deepEqual(
    a.passages.map((p) => p.id),
    [apid.id, lead.id],
    'only numbers that name a passage',
  );
  assert.equal(citation(a.passages[0]!), 'The Cloud Leaks, “The support desk as a disclosure engine”');
  const req = asks.provider.requests[0]!;
  assert.match(req.messages[0]!.content, /from those pages alone/);
  assert.match(lastUser(req), new RegExp(`\\[${apid.id}\\] From "The Cloud Leaks", section "The support desk`));
  assert.match(lastUser(req), /The passage of the article the question is about:\n<<<\nAPID-11887 held/);
  assert.match(lastUser(req), /The question: Who put the connection strings/);
  assert.ok(!lastUser(req).includes('S3cretPassw0rdXYZ'), 'the password never reaches the model');

  // An answer that names no passage is the model's own: no answer.
  const own = fakeLLM({ complete: () => JSON.stringify({ answer: 'Hackers did.', passages: [] }) });
  assert.equal((await askSources(own.llm, { question: 'Who pasted the strings?', sources: [leak] })).found, false);
});

test('an answer reads without the passage numbers the model cites in it', () => {
  assert.equal(
    tidyAnswer('Passage [11] states that there were 115,308 keypairs in plaintext.'),
    'There were 115,308 keypairs in plaintext.',
  );
  assert.equal(tidyAnswer('According to passages 3 and 5, engineers pasted them [3, 5].'), 'Engineers pasted them.');
  assert.equal(tidyAnswer('Engineers pasted them into tickets [2].'), 'Engineers pasted them into tickets.');
  assert.equal(tidyAnswer('Sources disagree on the date.'), 'Sources disagree on the date.', 'words, not a number');
});
