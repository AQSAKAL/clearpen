// Autocorrect: the instant rules as each word ends, the sentence that's just
// finished, and which of the model's fixes are safe to make for the writer.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { correctionFixes, finishedSentence, looksEnglish, quickFix } from '../src/autocorrect.ts';
import { applyHunks } from '../src/diff.ts';
import { proofread } from '../src/tasks/proofread.ts';
import { fakeLLM, lastUser } from './fake.ts';

/** The line once the word's fix is made. */
const fixed = (before: string, opts?: Parameters<typeof quickFix>[1]) => {
  const fix = quickFix(before, opts);
  return fix ? applyHunks(before, [fix]) : before;
};

test('as each word ends: a capital to start a sentence, "i" and plain slips', () => {
  assert.equal(fixed('this '), 'This ');
  assert.equal(fixed('It works. this '), 'It works. This ');
  assert.equal(fixed('Does it? yes, '), 'Does it? Yes, ');
  assert.equal(fixed('# teh '), '# The ');
  assert.equal(fixed('and i '), 'and I ');
  assert.equal(fixed('So i’m '), 'So I’m ');
  assert.equal(fixed('We read teh '), 'We read the ');
  assert.equal(fixed('We read teh.'), 'We read the.');
  assert.equal(fixed('I dont ', { curly: false }), "I don't ");
  assert.equal(fixed('I dont ', { curly: true }), 'I don’t ');
  assert.equal(fixed('Dont '), "Don't ");
  assert.equal(fixed('We do alot '), 'We do a lot ');
  // Left alone: words meant as typed, list items, abbreviations, ellipses, and slips with two readings.
  for (const line of [
    'iPhone ',
    'NASA ',
    '- this ',
    '1. this ',
    'See e.g. this ',
    'Wait... then ',
    'This is mi ',
    'You cant ',
  ]) {
    assert.equal(fixed(line), line, line);
  }
  // Mid-word, nothing yet.
  assert.equal(quickFix('teh'), null);
  // The English slips only where the writing is English; a capital is everyone's.
  assert.equal(fixed('ecco i ', { english: false }), 'ecco i ');
  assert.equal(fixed('ecco ', { english: false }), 'Ecco ');
});

test('looksEnglish', () => {
  assert.equal(looksEnglish('The plan is good, but it is late and they are not ready for it.'), true);
  assert.equal(looksEnglish('Questo è un testo scritto in italiano per vedere se funziona davvero bene oggi.'), false);
  assert.equal(looksEnglish('i cani'), true, 'too little to tell');
});

test('the sentence just finished', () => {
  const span = (before: string) => {
    const s = finishedSentence(before);
    return s && before.slice(s.from, s.to);
  };
  assert.equal(span('this is mi favorite film. '), 'this is mi favorite film.');
  assert.equal(span('First one here. second one here? '), 'second one here?');
  assert.equal(span('We met Dr. Smith today. '), 'We met Dr. Smith today.');
  assert.equal(span('He said “it works.” '), 'He said “it works.”');
  assert.equal(span('Old para.\n\nNew one starts here. '), 'New one starts here.');
  // Enter ends a heading or a list item, punctuated or not.
  assert.equal(span('# teh big plan\n'), 'teh big plan');
  assert.equal(span('- buy mlik today\n- '), 'buy mlik today');
  // Not yet, or not prose.
  for (const before of [
    'Like e.g. ',
    'Hello. ',
    'Some text',
    'Some text.',
    '    code here now. ',
    '| a | b |\n',
    '\n',
  ]) {
    assert.equal(span(before), null, JSON.stringify(before));
  }
});

test('the model’s fixes are kept only when they are small and safe', () => {
  const apply = (s: string, p: string) => applyHunks(s, correctionFixes(s, p));
  assert.equal(apply('this is mi favorite film.', 'this is my favorite film.'), 'this is my favorite film.');
  assert.equal(
    apply('Teh results was better then we expected.', 'The results were better than we expected.'),
    'The results were better than we expected.',
  );
  assert.equal(apply('He go to school.', 'He goes to school.'), 'He goes to school.');
  assert.equal(apply('I going home.', 'I am going home.'), 'I am going home.');
  assert.equal(apply('We went to the the store.', 'We went to the store.'), 'We went to the store.');
  assert.equal(apply('We should of left.', 'We should have left.'), 'We should have left.');
  assert.equal(apply('Done,, and dusted .', 'Done, and dusted.'), 'Done, and dusted.');
  assert.equal(apply('It’s fine but i dont know.', "It's fine but I don't know."), 'It’s fine but I don’t know.');
  assert.equal(apply('this is mi film.', '"this is my film."'), 'this is my film.', 'quotes around the answer');
  // A heading doesn't gain a full stop.
  assert.equal(apply('Teh plan', 'The plan.'), 'The plan');
  // The writer's: names, numbers, links, their spelling and their slang.
  const kept = [
    ['The team at Nazri Labs shipped.', 'The team at Nazari Labs shipped.'],
    ['We shipped 3 builds in 2025.', 'We shipped 3 builds in 2024.'],
    ['The colour was grey.', 'The color was gray.'],
    ['It was kinda meh.', 'It was kind of meh.'],
    ['See [the docs](https://exmaple.com) now.', 'See [the docs](https://example.com) now.'],
    ['Use `pritn` here.', 'Use `print` here.'],
    ['It shipped, finally.', 'It shipped finally.'],
    // A rewrite isn't proofreading: nothing at all.
    ['Remote work changed how we hire.', 'Working remotely transformed our whole hiring process.'],
    ['The plan was good but late.', 'This idea seemed fine though slow.'],
  ];
  for (const [s, p] of kept) assert.deepEqual(correctionFixes(s!, p!), [], s);
  // Offsets keep the sentence's own spaces.
  assert.deepEqual(correctionFixes('  mi film.', 'my film.'), [{ from: 2, to: 4, insert: 'my' }]);
});

test('proofread asks the model about one sentence and returns only safe fixes', async () => {
  const { llm, provider } = fakeLLM({
    complete: () => JSON.stringify({ sentence: 'This is my favourite film, made in 2020.' }),
  });
  const sentence = 'this is mi favourite film, made in 2021.';
  const fixes = await proofread(llm, { sentence, before: 'We watched it twice.' });
  assert.equal(applyHunks(sentence, fixes), 'This is my favourite film, made in 2021.');
  const ask = lastUser(provider.requests[0]!);
  assert.match(ask, /We watched it twice[\s\S]*The sentence:\n<<<\nthis is mi favourite film/);
  assert.equal(provider.requests[0]!.temperature, 0);

  // Too short to bother, or an answer that isn't JSON: nothing.
  assert.deepEqual(await proofread(llm, { sentence: 'Hello.' }), []);
  const garbled = fakeLLM({ complete: () => 'Sure! Here is the sentence' });
  assert.deepEqual(await proofread(garbled.llm, { sentence }), []);
});
