// How the prose reads: the reader-expectation and plain-English checks, each
// against a sentence that must be flagged and one that must not.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sentences } from '../src/analysis.ts';
import { runChecks } from '../src/checks.ts';
import { skeleton, stem, stressPosition, styleFindings, topicPosition } from '../src/style.ts';

const kinds = (text: string, genre: 'article' | 'technical' | 'scientific' = 'article') =>
  styleFindings(text, genre).map((f) => f.kind);
const one = (text: string, kind: string, genre: 'article' | 'technical' | 'scientific' = 'article') => {
  const f = styleFindings(text, genre).find((x) => x.kind === kind);
  assert.ok(f, `expected a ${kind} finding in: ${text.slice(0, 60)}`);
  return f;
};
const quoted = (text: string, kind: string, genre: 'article' | 'technical' | 'scientific' = 'article') => {
  const f = one(text, kind, genre);
  return text.slice(f.from, f.to);
};

test('plain words: the pompous word and its one-click replacement', () => {
  const t = 'We will utilise the new tool prior to launch in order to ascertain the cause.';
  const plain = styleFindings(t, 'article').filter((f) => f.kind === 'plain');
  assert.deepEqual(
    plain.map((f) => [t.slice(f.from, f.to), f.suggestion]),
    [
      ['utilise', 'use'],
      ['prior to', 'before'],
      ['in order to', 'to'],
      ['ascertain', 'find out'],
    ],
  );
  assert.equal(one('Utilise the tool.', 'plain').suggestion, 'Use', 'a sentence-initial replacement keeps its capital');
  assert.equal(one('They utilised the tool.', 'plain').suggestion, 'used');
  assert.equal(one('I should of known better.', 'plain').suggestion, 'should have');
  assert.equal(one("Back in the 1990's we wrote letters.", 'plain').suggestion, '1990s');
  assert.equal(one('Ask the user whether he/she wants a receipt.', 'plain').suggestion, 'they');
  assert.equal(one('The analysis was of a satisfactory nature.', 'plain').suggestion, 'satisfactory');
  assert.equal(
    quoted('We eat fruit such as apples, oranges, etc. every day.', 'plain'),
    'such as apples, oranges, etc.',
  );
  assert.equal(
    one('We eat fruit such as apples, oranges, etc. every day.', 'plain').suggestion,
    'such as apples, oranges',
  );
  // Only a note, no replacement, where the author must choose the words.
  assert.equal(one('The aforementioned people agreed.', 'plain').suggestion, undefined);
  assert.ok(!kinds('We use the tool before launch to find the cause.').includes('plain'));
});

test('the action hidden in a noun is named, with the verb', () => {
  assert.equal(one('The team made a decision to leave early.', 'hidden-action').suggestion, 'decided');
  assert.equal(one('We make use of the cache on every request.', 'hidden-action').suggestion, 'use');
  assert.equal(one('It has an effect on the whole pipeline.', 'hidden-action').suggestion, 'affects');
  const t = 'The analysis of the data was performed by the team.';
  const f = one(t, 'hidden-action');
  assert.equal(f.suggestion, 'The team analysed the data');
  assert.match(f.message, /analyse/);
  assert.ok(!kinds('The team decided to leave early.').includes('hidden-action'));
  // A sentence told in "is" with its actions in nouns.
  const weak =
    'The implementation of the migration is the responsibility of the platform team, and the verification of the results is a requirement.';
  assert.match(one(weak, 'weak-verb').message, /“is”[\s\S]*implementation[\s\S]*implement/);
  assert.ok(!kinds('The platform team migrated the data and verified the results.').includes('weak-verb'));
});

test('a long aside between the subject and its verb', () => {
  const t =
    'The smallest of the frames, a 207-nucleotide reading frame overlapping out of phase the terminal portion of the subunit 6 gene, has been identified as the animal equivalent.';
  const f = one(t, 'interruption');
  assert.match(t.slice(f.from, f.to), /^, a 207-nucleotide/);
  assert.match(f.message, /words come between the subject and its verb “has”/);
  assert.ok(
    !kinds('The team, which met on Monday, has agreed to the plan after a long discussion.').includes('interruption'),
  );
});

test('a sentence that ends on an afterthought', () => {
  assert.equal(
    quoted('We shipped the feature to every customer in the region last week as well.', 'weak-ending'),
    'as well',
  );
  assert.equal(quoted('The rollout reached the whole region before the deadline, however.', 'weak-ending'), 'however');
  assert.ok(!kinds('We shipped it as well.').includes('weak-ending'), 'too short to matter');
  assert.ok(
    !kinds('However, we shipped the feature to every customer in the region last week.').includes('weak-ending'),
  );
  // A closing citation is convention, not an afterthought.
  assert.ok(
    !kinds('Pollen moves between the orchards on the wind more than on bees (Smith 2019).').includes('weak-ending'),
  );
});

test('old before new: a sentence that opens on the new and ends on the known', () => {
  const t =
    'Bees disperse pollen across the meadow every spring. The warmth of the morning sun wakes the bees and the pollen.';
  const f = one(t, 'new-before-old');
  assert.equal(t.slice(f.from, f.to), 'The warmth of the');
  assert.match(f.message, /opens on “The warmth of the”/);
  const linked =
    'Bees disperse pollen across the meadow every spring. These bees also carry the pollen to the orchard.';
  assert.ok(!kinds(linked).includes('new-before-old'));
  assert.ok(!kinds(linked).includes('no-link'));
});

test('a sentence with no link back to the one before', () => {
  const t =
    'Rome fell to invaders after centuries of decline and civil war. The printing press changed how Europe shared knowledge quickly. Modern factories assemble cars with robots on long production lines.';
  const f = one(t, 'no-link');
  assert.match(t.slice(f.from, f.to), /^The printing press/);
  // One structural note per paragraph, not one per sentence.
  assert.equal(styleFindings(t, 'article').filter((x) => x.category === 'structure').length, 1);
});

test('whose story: every sentence opens on something new', () => {
  const t =
    'Large earthquakes along a given fault segment do not occur at random intervals. The rates at which tectonic plates move are approximately uniform. Modern instruments have recorded ground motion since 1950. Subsequent mainshocks are rarer than most people expect in practice.';
  const f = one(t, 'topic-shift');
  assert.match(f.message, /“Large earthquakes along”, “The rates at”/);
  assert.equal(styleFindings(t, 'article').filter((x) => x.category === 'structure').length, 1);
});

test('shape: a list told in prose, the same opener three times, every sentence the same length', () => {
  const list = 'First, set the alarm. Then take a shower. Next, get dressed. Finally, walk to the university.';
  assert.match(
    one(list, 'hidden-list').message,
    /4 sentences here are items in a sequence \(“First”, “Then”, “Next”\)/,
  );
  const opener =
    'This helped me see the pattern. This realization changed my approach. This understanding transformed how I taught.';
  assert.match(one(opener, 'same-opener').message, /open with “This”/);
  const flat =
    'The team shipped the new billing page to every customer on Monday morning. The same team then watched the support queue drop by half in two days. These customers mostly held the old annual plan and wrote in about renewals. The team fixed the old plan’s migration bug before the weekend without downtime.';
  assert.match(one(flat, 'monotone').message, /All 4 sentences here run 13–14 words/);
  assert.ok(
    !kinds(
      'Short. Then a much longer sentence that wanders on for a while before it stops. Short again. And one more of middling length here.',
    ).includes('monotone'),
  );
});

test('strength: stacked hedges, and sentences that say nothing', () => {
  assert.match(
    one('Perhaps the results might possibly suggest that the effect is somewhat smaller.', 'hedge-stack').message,
    /hedges in one sentence/,
  );
  assert.ok(!kinds('I think the effect is smaller.').includes('hedge-stack'), 'one hedge is information, not a stack');
  assert.equal(quoted('Pricing is a complex issue with many factors.', 'says-nothing'), 'is a complex issue');
  assert.ok(!kinds('Pricing is a complex issue: 40% of our churn traces to the annual plan.').includes('says-nothing'));
});

test('initials: spelled out never, or only after their first use', () => {
  const never = 'The DQS rejected the batch. The DQS also flagged two rows. Nobody reviewed the DQS log.';
  const f = one(never, 'initials');
  assert.equal(never.slice(f.from, f.to), 'DQS');
  assert.match(f.message, /appears 3 times and is never spelled out/);
  const late = 'The DQS rejected the batch. The data quality service (DQS) runs nightly.';
  assert.match(one(late, 'initials').message, /spelled out only later/);
  assert.ok(!kinds('The data quality service (DQS) runs nightly. The DQS rejected the batch.').length);
  assert.ok(!kinds('The API returned JSON to the CLI.').includes('initials'), 'initials everyone knows');
  assert.ok(!kinds('The DQS rejected the batch.').includes('initials'), 'used once: not worth a note');
});

test('mechanics by genre: nested brackets, spatial figure references, “significant”', () => {
  assert.ok(kinds('The tool (which we built last year (in a hurry)) failed.').includes('nested-parens'));
  assert.ok(kinds('The figure below shows the flow.', 'technical').includes('spatial-ref'));
  assert.ok(!kinds('The figure below shows the flow.', 'article').includes('spatial-ref'), 'fine in a blog post');
  assert.ok(kinds('The treatment group improved significantly.', 'scientific').includes('significant'));
  assert.ok(!kinds('The treatment group improved significantly (p < 0.01).', 'scientific').includes('significant'));
  assert.ok(!kinds('The treatment group improved significantly.', 'article').includes('significant'));
});

test('an opening that says what it will discuss, not what it found', () => {
  const described =
    'This article describes the advantages and disadvantages of each option and provides a recommendation.\n\nThe options are listed below.';
  assert.ok(kinds(described).includes('descriptive-opening'));
  const told =
    'This article shows that option 3 saves 40% a year, and we recommend it.\n\nThe options are listed below.';
  assert.ok(!kinds(told).includes('descriptive-opening'));
});

test('an announced count that the list disagrees with', () => {
  const four =
    'A shared inbox fixes three things:\n\n- Requests reach whoever is free.\n- Nothing is lost.\n- Replies are consistent.\n- Managers see the load.\n';
  const f = one(four, 'count-mismatch');
  assert.equal(four.slice(f.from, f.to), 'three');
  assert.equal(f.suggestion, 'four');
  assert.match(f.message, /promises 3; the list that follows has 4/);
  const three =
    'A shared inbox fixes 3 things:\n\n- Requests reach whoever is free.\n- Nothing is lost.\n- Replies are consistent.\n';
  assert.ok(!kinds(three).includes('count-mismatch'));
});

test('topic and stress positions, stems, and the skeleton view', () => {
  const [s] = sentences('However, the rates at which plates move are approximately uniform; the intervals vary.');
  assert.equal(
    topicPosition(s!)
      .map((t) => t.word)
      .join(' '),
    'the rates at which plates move',
  );
  assert.equal(
    stressPosition(s!)
      .map((t) => t.word)
      .join(' '),
    'the intervals vary',
  );
  assert.equal(stem('decisions'), 'decision');
  assert.equal(stem('centuries'), 'century');
  assert.equal(stem('running'), 'runn');
  const sk = skeleton('# T\n\n## Why\n\nThe plan is simple. Bees disperse pollen. There is a reason for the delay.');
  assert.equal(sk.length, 1);
  assert.equal(sk[0]!.heading, 'Why');
  assert.deepEqual(
    sk[0]!.sentences.map((x) => [x.opener, x.verb]),
    [
      ['The plan', 'is'],
      ['Bees disperse pollen', null],
      ['There', 'is'],
    ],
  );
});

test('the style findings reach runChecks, after the exact checks, and never break positions', () => {
  const text =
    'Pricing is a complex issue with many factors. We will utilise the new tool prior to launch. The treatment group improved significantly.';
  const { findings } = runChecks(text, { genre: 'scientific' });
  for (const k of ['says-nothing', 'plain', 'significant'])
    assert.ok(
      findings.some((f) => f.kind === k),
      k,
    );
  for (const f of findings) assert.ok(f.from < f.to && f.to <= text.length && text.slice(f.from, f.to).trim());
  // Code and prose that isn't prose are left alone.
  assert.equal(styleFindings('```\nutilise(); // prior to launch\n```\n', 'article').length, 0);
  assert.equal(styleFindings('| utilise | prior to |\n|---|---|\n| a | b |\n', 'article').length, 0);
});
