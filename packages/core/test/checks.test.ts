// The deterministic checks, against the three persona drafts with their
// planted errors — and against sentences that must NOT be flagged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import { type Finding, factsBlock, matches, numbersIn, parseNumber, runChecks } from '../src/checks.ts';
import { applyHunks, hunks } from '../src/diff.ts';
import { placeEdit } from '../src/edits.ts';
import { intentOf } from '../src/intent.ts';

const read = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const thesis = read('thesis.md');
const business = read('business-case.md');
const tech = read('tech-guide.md');
const article = read('draft.md');

/** The finding of `kind` whose passage is `quote` (or contains it) — failing the test if there is none. */
function find(text: string, findings: Finding[], kind: string, quote?: string): Finding {
  const f = findings.find((x) => x.kind === kind && (!quote || text.slice(x.from, x.to).includes(quote)));
  assert.ok(f, `no ${kind} finding${quote ? ` on “${quote}”` : ''}`);
  return f;
}

test('numbers keep their unit, scale and stated precision', () => {
  assert.deepEqual((({ value, unit, decimals }) => ({ value, unit, decimals }))(parseNumber('$2.56M')!), {
    value: 2560000,
    unit: '$',
    decimals: 2,
  });
  assert.equal(parseNumber('18.2x')?.unit, 'x');
  assert.equal(parseNumber('ROI: 93.4%')?.raw, '93.4%');
  assert.ok(matches(37.77, parseNumber('37.8%')!));
  assert.ok(!matches(76.3, parseNumber('93.4%')!));
  // Parsing one number must not hide the first numbers from the next scan.
  parseNumber('Costs were $2.56M in total.');
  assert.deepEqual(
    numbersIn('1 and 2 and 3').map((n) => n.value),
    [1, 2, 3],
  );
});

test('business case: wrong net benefit, ROI and payback are caught and corrected', () => {
  const { findings, facts } = runChecks(business, { genre: 'business' });
  const eq = find(business, findings, 'equation', '$2.56M');
  assert.equal(eq.suggestion, '$2.09M');
  // The ROI equation uses the wrong net benefit — corrected, it is 76.3%.
  const roi = findings.find((f) => f.kind === 'equation' && business.slice(f.from, f.to) === '93.4%');
  assert.equal(roi?.suggestion, '76.3%');
  // The executive summary repeats both wrong figures.
  const summaryEnd = business.indexOf('## Background');
  assert.ok(findings.some((f) => f.from < summaryEnd && business.slice(f.from, f.to) === '$2.56M'));
  assert.ok(findings.some((f) => f.from < summaryEnd && business.slice(f.from, f.to) === '93.4%'));
  assert.match(find(business, findings, 'payback', '14 months').message, /about 20 months/);
  // The table itself is consistent: no false totals.
  assert.ok(!findings.some((f) => f.kind === 'table-total'));
  assert.ok(facts.some((f) => /VERIFIED: table "Total benefits" \/ "Year 1" = \$910K/.test(f)));
  // The author's discounting is right under the year-1-undiscounted convention.
  assert.ok(!findings.some((f) => f.kind === 'npv'));
  assert.ok(find(business, findings, 'source', 'Industry studies show'));
  assert.ok(find(business, findings, 'vague', 'fast'));
  assert.ok(find(business, findings, 'bandwagon', 'Best-in-class retailers'));
  assert.equal(find(business, findings, 'spelling-variant', 'modernize').suggestion, 'modernise');
});

test('investment thesis: target maths, probabilities, PEG, margins and missing risks', () => {
  const { findings, facts } = runChecks(thesis, { genre: 'investment' });
  assert.match(find(thesis, findings, 'target', '20x').message, /\$53\.00, not the \$58 target/);
  assert.match(find(thesis, findings, 'probabilities').message, /105%/);
  assert.match(find(thesis, findings, 'weighted', '$58.95').message, /\$56\.14/);
  assert.ok(find(thesis, findings, 'peg', '0.85'));
  const margin = find(thesis, findings, 'table-text', '30%');
  assert.equal(margin.category, 'consistency');
  assert.match(margin.message, /26\.4%/);
  assert.match(
    find(thesis, findings, 'risk-gap', 'Key risks').message,
    /customer concentration or the contract renewal/,
  );
  assert.ok(find(thesis, findings, 'share', '34%'));
  assert.ok(find(thesis, findings, 'promise', 'guaranteed'));
  assert.ok(find(thesis, findings, 'forward', 'will reach'));
  // Correct relations are verified, not flagged.
  for (const ok of [
    /37\.8% upside/,
    /= 18\.2x EPS/,
    /= 11\.5x/,
    /enterprise value \$3\.81B/,
    /6\.1% free-cash-flow yield/,
    /1\.03x net leverage/,
  ]) {
    assert.ok(
      facts.some((f) => f.startsWith('VERIFIED') && ok.test(f)),
      String(ok),
    );
  }
  // The bull case's 28% margin is a scenario, not a claim.
  assert.ok(!findings.some((f) => thesis.slice(f.from, f.to) === '28%'));
  assert.ok(!findings.some((f) => f.kind === 'rating'));
});

test('technical guide: prerequisites, terminology, steps, secrets and contradictions', () => {
  const { findings } = runChecks(tech, { genre: 'technical' });
  assert.match(find(tech, findings, 'prereq').message, /`nimbus`/);
  assert.ok(find(tech, findings, 'terminology', 'token'));
  assert.ok(find(tech, findings, 'terminology', 'secret'));
  assert.match(find(tech, findings, 'step-ref', 'step 5 above').message, /Create your first key/);
  assert.equal(findings.filter((f) => f.kind === 'secret').length, 3);
  assert.equal(find(tech, findings, 'spelling', 'succesful').suggestion, 'successful');
  assert.match(find(tech, findings, 'conflict', '48 hours').message, /24 hours/);
  assert.ok(find(tech, findings, 'vague-step', 'everywhere'));
  assert.ok(find(tech, findings, 'vague-step', 'Restart the service'));
  // Docs are full of "never" and "every request" — no logic notes in technical mode.
  assert.ok(!findings.some((f) => f.category === 'logic'));
});

test('article: unsourced claims, and figures that contradict the writer’s notes', () => {
  const sources = 'A 2023 survey by Atlassian found teams that write decisions down are 41% more productive.';
  const { findings } = runChecks(article, { genre: 'article', sources });
  assert.ok(find(article, findings, 'source', 'Studies show'));
  assert.equal(find(article, findings, 'notes-mismatch', '47%').suggestion, '41%');
});

test('ordinary sentences are left alone', () => {
  const clean = [
    'Everyone on the team signed off on the plan before launch.',
    'Since 2020, revenue grew 40% a year at the company.',
    'Clearly label each field so readers know what to type.',
    'It is the first step in a long process of change.',
    'Our churn is 4% and our renewal rate is 96%, so the base is sticky.',
    'Developers spend 73% of their time reading code, according to a study by Minelli (2015).',
    'Margin is a calm editor. Margins in the editor show notes.',
  ];
  for (const text of clean) assert.deepEqual(runChecks(text, { genre: 'article' }).findings, [], text);
  assert.deepEqual(runChecks('The vendor guarantees 99.9% uptime under the SLA.', { genre: 'business' }).findings, []);
  assert.deepEqual(
    runChecks('We think margins will expand, and we expect the stock will re-rate.', { genre: 'investment' }).findings,
    [],
  );
});

test('logic, consistency and fact-check catch the classic slips', () => {
  const cases = [
    ['Since we launched the newsletter, signups rose 30%.', 'post-hoc'],
    ['Clearly, the old process was broken beyond repair.', 'assertion'],
    ['Teams that write things down tend to ship faster because they argue less.', 'causation'],
    ['We must modernise or be left behind by our rivals.', 'dichotomy'],
    ['We organise the files and later we organize the folders.', 'spelling-variant'],
    ['73% of developers say they prefer dark mode.', 'stat'],
    ['Acme is the largest maker of anvils in the world.', 'superlative'],
  ];
  for (const [text, kind] of cases)
    assert.ok(
      runChecks(text, { genre: 'article' }).findings.some((f) => f.kind === kind),
      `${kind}: ${text}`,
    );
  const ratings = runChecks(
    'Rating: Buy. We like the shares.\n\n## Conclusion\n\nWe rate the shares a Hold until the print.',
    { genre: 'investment' },
  );
  assert.ok(ratings.findings.some((f) => f.kind === 'rating'));
  const names = runChecks('Corvane sells gateways. We like Corvane here. Analysts covering Corvaine disagree.', {
    genre: 'article',
  });
  assert.equal(names.findings.find((f) => f.kind === 'name')?.suggestion, 'Corvane');
});

test('facts block tells the model what was verified and what is already flagged', () => {
  const block = factsBlock(runChecks(business, { genre: 'business' }));
  assert.match(block, /CALCULATIONS CHECKED BY SOFTWARE/);
  assert.match(block, /WRONG: \$4\.83M − \$2\.74M = \$2\.09M/);
  assert.match(block, /ALREADY FLAGGED BY SOFTWARE/);
  assert.equal(factsBlock({ findings: [], facts: [] }), '');
});

// ─────────────────────────────────────────────────────────── pinpoint edits

const apply = applyHunks;

test('a rewrite is split into only the spots that changed', () => {
  const before = 'The quick brown fox jumps over the lazy dog. It was a sunny day.';
  const after = 'The quick red fox jumps over the lazy dog. It was a sunny day.';
  assert.deepEqual(hunks(before, after), [{ from: 10, to: 15, insert: 'red' }]);
  const paras = 'One.\n\nTwo.\n\nThree.';
  const withHeadings = '## A\n\nOne.\n\n## B\n\nTwo.\n\nThree.';
  const hs = hunks(paras, withHeadings);
  assert.equal(hs.length, 2);
  assert.ok(
    hs.every((h) => h.from === h.to),
    'pure inserts',
  );
  // A mostly rewritten sentence stays one readable change.
  assert.equal(hunks('We should probably consider maybe using it soon.', 'Use it this quarter.').length, 1);
  for (const [a, b] of [
    [before, after],
    [paras, withHeadings],
    ['Their going tommorow.', 'They’re going tomorrow.'],
  ])
    assert.equal(apply(a, hunks(a, b)), b);
  assert.deepEqual(hunks('same', 'same'), []);
});

test('model edits land exactly where they belong, as blocks or inline', () => {
  const text = 'First para here.\n\nSecond para here.\n\nLast para here.';
  const h1 = placeEdit(text, { type: 'insert_before', anchor: 'Second para here.', text: '## Middle' });
  assert.deepEqual(h1, { from: 18, to: 18, insert: '## Middle\n\n' });
  // A heading "after" the last paragraph must have meant before it.
  const h2 = placeEdit(text, { type: 'insert_after', anchor: 'Last para here.', text: '## End' });
  assert.equal(apply(text, [h2!]), 'First para here.\n\nSecond para here.\n\n## End\n\nLast para here.');
  const r = placeEdit(text, { type: 'replace', anchor: 'Second para', text: 'Middle paragraph' });
  assert.equal(apply(text, [r!]), 'First para here.\n\nMiddle paragraph here.\n\nLast para here.');
  const d = placeEdit(text, { type: 'delete', anchor: 'para', text: '' });
  assert.equal(apply(text, [d!]).split('\n')[0], 'First here.');
  assert.equal(placeEdit(text, { type: 'replace', anchor: 'not in the text at all', text: 'x' }), null);
});

test('typed instructions are routed to checks, answers or edits', () => {
  for (const [s, want] of [
    ['fact check it', 'factcheck'],
    ['Is this true?', 'factcheck'],
    ['verify the numbers', 'factcheck'],
    ['any factual errors?', 'factcheck'],
    ['check the logic', 'logic'],
    ['does this make sense?', 'logic'],
    ['is the reasoning sound', 'logic'],
    ['is this consistent with the intro?', 'consistency'],
    ['what does BM25 stand for?', 'ask'],
    ['why would a reader care', 'ask'],
    ['write catchy subheadings', null],
    ['make it punchier', null],
    ['can you make it shorter?', null],
    ['turn this into a list', null],
  ] as [string, string | null][])
    assert.equal(intentOf(s), want, s);
});
