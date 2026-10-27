// The terms registry: what a draft defines, under which names, and the notes
// that fall out of it — each against a case that must be flagged and one that
// must not.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runChecks } from '../src/checks.ts';
import { type Term, termFindings, terms } from '../src/terms.ts';

const kinds = (text: string) => termFindings(text).map((f) => f.kind);
const one = (text: string, kind: string) => {
  const f = termFindings(text).find((x) => x.kind === kind);
  assert.ok(f, `expected a ${kind} finding in: ${text.slice(0, 60)}`);
  return f;
};
const named = (text: string, name: string): Term => {
  const t = terms(text).find((x) => x.name === name);
  assert.ok(t, `expected the term “${name}” in: ${text.slice(0, 60)}`);
  return t;
};
const counts = (t: Term) => t.names.map((n) => [n.name, n.count, n.variant ?? false]);

/** Enough prose to put more than 1,500 words between two mentions. */
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} keeps the reader busy with ten plain words here.`).join(
    '\n\n',
  );

test('a long name with its initials, either way round', () => {
  const after = 'The data quality service (DQS) runs nightly. The DQS rejected the batch, and the DQS log says why.';
  const t = named(after, 'data quality service');
  assert.equal(t.source, 'initials');
  assert.equal(t.head, 'service');
  assert.equal(after.slice(t.definition!.from, t.definition!.to), 'data quality service (DQS)');
  assert.equal(after.slice(t.first.from, t.first.to), 'data quality service');
  assert.deepEqual(counts(t), [
    ['data quality service', 1, false],
    ['DQS', 3, false],
  ]);
  const before = 'DQS (the data quality service) runs nightly. The DQS rejected the batch.';
  const u = named(before, 'data quality service');
  assert.equal(u.names.find((n) => n.name === 'DQS')?.count, 2);
  assert.equal(before.slice(u.definition!.from, u.definition!.to), 'DQS (the data quality service)');
  // Initials whose letters the words before do not spell are not a definition of those words.
  assert.deepEqual(terms('We shipped the tool (API) on Monday. The API is fast.'), []);
  assert.deepEqual(terms('Corvane Systems (NASDAQ: CRVN) sells gateways.'), []);
});

test('“we call this”, “is called”, “known as”, and a function call that is not a name', () => {
  const t = named(
    'Readers stress the end of a sentence. We call this the stress position. The stress position carries the point.',
    'stress position',
  );
  assert.equal(t.source, 'called');
  assert.deepEqual(counts(t), [['stress position', 2, false]]);
  assert.equal(
    named('A graph with no odd cycle is called bipartite. Every tree is bipartite.', 'bipartite').head,
    'bipartite',
  );
  assert.equal(named('The method known as “chunking” splits the text. Chunking is fast.', 'chunking').source, 'called');
  assert.equal(named('We call them nice graphs. A nice graph has no odd cycle.', 'nice graph').names[0]?.count, 2);
  // "we call the endpoint" names nothing; "is called on every keystroke" is a verb.
  assert.deepEqual(terms('We call the endpoint on every save. The endpoint answers in a second.'), []);
  assert.deepEqual(terms('The judge is called on every keystroke. The judge is cheap.'), []);
});

test('“X, that is, …” and a phrase in bold at its first use', () => {
  const t = named(
    'The engine shows the skeleton, that is, each sentence by its opening words. The skeleton is instant.',
    'skeleton',
  );
  assert.equal(t.source, 'that-is');
  assert.equal(t.names[0]?.count, 2);
  // "that is" opening a clause, with no comma after it, defines nothing.
  assert.deepEqual(terms('For a tool, that is an ordering rule. The tool runs the rule.'), []);
  const bold = named(
    'A **topic position** is the start of a sentence. The topic position names whose story it is.',
    'topic position',
  );
  assert.equal(bold.source, 'emphasis');
  assert.equal(bold.definition!.from, 2);
  // Bold for stress, a label, or a phrase the draft never uses again is not a definition.
  assert.deepEqual(terms('This is **not** the point. It is not.'), []);
  assert.deepEqual(terms('**Note:** the batch failed. The batch is retried.'), []);
  assert.deepEqual(terms('We shipped **fast**. Nothing else happened.'), []);
  // A phrase already used in plain text is not being defined by a later bold.
  assert.deepEqual(terms('The topic position matters. A **topic position** is the start of a sentence.'), []);
});

test('a “Definition” paragraph names its term', () => {
  const t = named('**Definition 1.** A graph is *nice* if it has no odd cycle.\n\nNice graphs are bipartite.', 'nice');
  assert.equal(t.source, 'definition');
  assert.equal(
    named(
      'Definition 2 (stress position). The last words of a sentence.\n\nThe stress position carries the point.',
      'stress position',
    ).source,
    'definition',
  );
  assert.equal(
    named('Definition. A graph is nice if it has no odd cycle.\n\nNice graphs are bipartite.', 'nice').names[0]?.count,
    2,
  );
  assert.equal(
    named(
      'Definition. The stress position is the end of a sentence.\n\nThe stress position carries the point.',
      'stress position',
    ).source,
    'definition',
  );
});

test('a cluster of near-synonyms that both recur', () => {
  const text =
    'The system stores every draft. The software also keeps a history. When the system restarts, the software reloads the history.';
  const t = named(text, 'system');
  assert.equal(t.source, 'cluster');
  assert.equal(t.definition, null);
  assert.deepEqual(counts(t), [
    ['system', 2, false],
    ['software', 2, false],
  ]);
  assert.equal(text.slice(t.first.from, t.first.to), 'system');
});

test('used before it is defined', () => {
  const late = 'The DQS rejected the batch yesterday. The data quality service (DQS) runs nightly.';
  const f = one(late, 'term-before-definition');
  assert.equal(late.slice(f.from, f.to), 'DQS');
  assert.equal(late.slice(f.related!.from, f.related!.to), 'data quality service (DQS)');
  assert.match(f.message, /defined only later/);
  const coined =
    'Readers look at the stress position first. The end of a sentence carries the news; we call this the stress position.';
  assert.equal(
    coined.slice(one(coined, 'term-before-definition').from, one(coined, 'term-before-definition').to),
    'stress position',
  );
  assert.ok(
    !kinds('The data quality service (DQS) runs nightly. The DQS rejected the batch.').includes(
      'term-before-definition',
    ),
  );
  // In the full run, one note on that passage — not this one and the initials check both.
  const { findings } = runChecks(late, { genre: 'article' });
  const at = findings.filter((x) => late.slice(x.from, x.to) === 'DQS');
  assert.equal(at.length, 1);
  assert.equal(at[0]!.kind, 'term-before-definition');
});

test('a derived form of a defined term, but never a plural or a spelling', () => {
  const text = 'A **nice graph** has no odd cycles. The niceness of graphs implies they are bipartite.';
  const f = one(text, 'term-variant');
  assert.equal(text.slice(f.from, f.to), 'niceness');
  assert.match(f.message, /You defined “nice graph”; “niceness” is a new word/);
  assert.equal(text.slice(f.related!.from, f.related!.to), '**nice graph**');
  assert.deepEqual(counts(named(text, 'nice graph')), [
    ['nice graph', 1, false],
    ['niceness', 1, true],
  ]);
  assert.ok(!kinds('A **nice graph** has no odd cycles. Nice graphs are bipartite.').includes('term-variant'));
  // A common word that happens to share a root is not a variant unless the rest of the term is near it.
  assert.ok(
    !kinds(
      'A **clear sentence** opens on what the reader knows. Clearly the weather turned. A clear sentence helps.',
    ).includes('term-variant'),
  );
  // British and American spellings are consistency, never a variant.
  assert.ok(
    !kinds('A **colour graph** is one with coloured vertices. The color graph has three colors.').includes(
      'term-variant',
    ),
  );
});

test('several names for one thing', () => {
  const text =
    'The system stores every draft. The software also keeps a history. When the system restarts, the software reloads the history.';
  const f = one(text, 'term-names');
  assert.equal(text.slice(f.from, f.to), 'software');
  assert.match(f.message, /“system” \(2×\) and “software” \(2×\)/);
  assert.equal(text.slice(f.related!.from, f.related!.to), 'system');
  assert.equal(f.category, 'consistency');
  // One mention, a compound noun, or a verb is not a second name.
  assert.ok(
    !kinds('The system stores every draft. A software engineer wrote the system in a week.').includes('term-names'),
  );
  assert.ok(
    !kinds('The user signs in. The user interface shows the customer support number. The user leaves.').includes(
      'term-names',
    ),
  );
  assert.ok(
    !kinds('We plan to ship the spec. The spec is short, and we plan to keep the spec short.').includes('term-names'),
  );
});

test('a term back after a long gap, unless the sentence recalls it', () => {
  const define = 'The data quality service (DQS) runs nightly.';
  const gap = filler(160);
  const back = `${define}\n\n${gap}\n\nThe DQS rejected the batch.`;
  const f = one(back, 'term-reminder');
  assert.equal(back.slice(f.from, f.to), 'DQS');
  assert.match(f.message, /last appeared 1,\d{3} words ago/);
  assert.equal(back.slice(f.related!.from, f.related!.to), 'data quality service (DQS)');
  assert.ok(!kinds(`${define}\n\n${gap}\n\nRecall that the DQS rejected the batch.`).includes('term-reminder'));
  assert.ok(!kinds(`${define}\n\n${filler(40)}\n\nThe DQS rejected the batch.`).includes('term-reminder'));
});

test('the term notes reach runChecks with sound positions, and leave code and tables alone', () => {
  const text =
    'A **nice graph** has no odd cycles. The niceness of graphs is useful. The DQS failed. The data quality service (DQS) runs nightly.';
  const { findings } = runChecks(text, { genre: 'scientific' });
  for (const k of ['term-variant', 'term-before-definition'])
    assert.ok(
      findings.some((f) => f.kind === k),
      k,
    );
  for (const f of findings) assert.ok(f.from < f.to && f.to <= text.length && text.slice(f.from, f.to).trim());
  assert.deepEqual(terms('```\nwe call this foo\n```\n'), []);
  assert.deepEqual(terms('| the system | the software |\n|---|---|\n| the system | the software |\n'), []);
  assert.deepEqual(terms(''), []);
});
