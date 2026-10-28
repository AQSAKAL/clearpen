// Signposts for the reader who skims: each check against a draft that must be
// flagged and one that must not, and none of them outside the technical genres.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runChecks } from '../src/checks.ts';
import { signpostFindings } from '../src/signposts.ts';

type G = 'article' | 'technical' | 'scientific';
const kinds = (text: string, genre: G = 'technical') => signpostFindings(text, genre).map((f) => f.kind);
const one = (text: string, kind: string, genre: G = 'technical') => {
  const f = signpostFindings(text, genre).find((x) => x.kind === kind);
  assert.ok(f, `expected a ${kind} finding in: ${text.slice(0, 60)}`);
  return f;
};
const quoted = (text: string, kind: string, genre: G = 'technical') => {
  const f = one(text, kind, genre);
  return text.slice(f.from, f.to);
};

/** An introduction, then a three-paragraph section that opens with `opener`. */
const section = (opener: string, paragraphs = 3) =>
  [
    '# Caching\n\nThe cache saves 40% of requests.\n\n## Setup',
    `${opener} The service reads its settings from one file. Each setting has a default.`,
    'The file lives beside the binary. Moving it breaks nothing, so long as the path is passed in.',
    'Restart the service after any change. It reloads nothing on its own.',
  ]
    .slice(0, 1 + paragraphs)
    .join('\n\n');

test('a long section whose first sentence says neither what it does nor what it finds', () => {
  const vague = 'There are a few things to keep in mind before going further.';
  const f = one(section(vague), 'section-opening');
  assert.equal(section(vague).slice(f.from, f.to), vague);
  assert.match(f.message, /have to read the section to learn what it is for/);
  // Opening inside the formalism counts too.
  assert.match(
    one(section('Let f be the map from a key to its shard.'), 'section-opening').message,
    /inside the details/,
  );
  // Says what it does; states a claim with a number or a named thing; too short to matter.
  assert.ok(!kinds(section('This section describes how the service is configured.')).includes('section-opening'));
  assert.ok(!kinds(section('We now turn to the settings file.')).includes('section-opening'));
  assert.ok(!kinds(section('The service reads the settings file that Postgres owns.')).includes('section-opening'));
  assert.ok(!kinds(section('One file holds every setting, and it is read once.')).includes('section-opening'));
  assert.ok(!kinds(section(vague, 2)).includes('section-opening'), 'two paragraphs are read at a glance');
  // A run-in label is not the sentence to judge: the one after it is.
  const labelled = section(`**Note.** ${vague}`);
  assert.equal(labelled.slice(one(labelled, 'section-opening').from).slice(0, vague.length), vague);
  assert.ok(
    !kinds(section('**Data migration.** Fourteen years of SKU history contain duplicates.')).includes(
      'section-opening',
    ),
  );
  // The introduction is not a section with a job to announce.
  assert.ok(
    !kinds(`# Caching\n\n${vague} The cache is small.\n\nIt is also fast.\n\nAnd cheap.\n`).includes('section-opening'),
  );
});

/** An introduction and two sections; `sentence` sits in the first of them. */
const pointer = (sentence: string, after = '') =>
  `# Caching\n\nThe cache saves 40% of requests.\n\n## Setup\n\n${sentence}\n${after}\n## Results\n\nHit rates rose by 40% in a week.\n`;

test('a pointer that names no place: "as discussed above", "see below"', () => {
  const back = pointer('The cache behaves as discussed above.');
  const f = one(back, 'vague-pointer');
  assert.equal(back.slice(f.from, f.to), 'as discussed above');
  assert.match(f.message, /Name the place/);
  // Exactly one section lies that way and it has a name: the fix names it.
  assert.equal(f.suggestion, 'as discussed in “Caching”');
  const forward = one(pointer('For the numbers, see below.'), 'vague-pointer');
  assert.equal(forward.suggestion, 'see “Results”');
  // Two sections that way: no fix, but the note lists them.
  const two = `${pointer('Nothing here.')}\nThe cache behaves as discussed above.\n`;
  const g = signpostFindings(two, 'technical').find((x) => x.kind === 'vague-pointer');
  assert.ok(g);
  assert.equal(g.suggestion, undefined);
  assert.match(g.message, /The sections before this one: “Caching”, “Setup”/);
  // The place is named in the sentence; the pointer has no direction word; the thing pointed at is right there.
  assert.ok(!kinds(pointer('As shown above in Figure 3, the cache behaves.')).includes('vague-pointer'));
  assert.ok(!kinds(pointer('The cache behaves as discussed in Section 2.')).includes('vague-pointer'));
  assert.ok(!kinds(pointer('The settings are shown below:', '\n```\nttl = 60\n```\n')).includes('vague-pointer'));
  assert.ok(!kinds(pointer('Before we begin, read the settings file.')).includes('vague-pointer'));
  assert.ok(
    !kinds(pointer('A sentence that ends on “as discussed above” says nothing.')).includes('vague-pointer'),
    'quoted',
  );
});

/** An introduction and three sections. */
const guide = (intro: string, sections = ['Install', 'Configure', 'Run']) =>
  `# Caching\n\n${intro}\n\n${sections.map((h) => `## ${h}\n\nOne step, then the next.`).join('\n\n')}\n`;

test('an introduction to four or more sections with no map of them', () => {
  const plain = guide('The cache saves 40% of requests. It costs little.');
  const f = one(plain, 'no-map');
  assert.equal(plain.slice(f.from, f.to), 'It costs little.', 'anchored where the map would go');
  assert.match(f.message, /^3 sections follow this one/);
  assert.equal(signpostFindings(plain, 'technical').filter((x) => x.kind === 'no-map').length, 1);
  // A sentence that walks the parts, a section number, or a list that names them.
  assert.ok(
    !kinds(guide('The cache saves 40% of requests. We first install it, then configure it.')).includes('no-map'),
  );
  assert.ok(!kinds(guide('The cache saves 40% of requests. Section 2 installs it.')).includes('no-map'));
  assert.ok(!kinds(guide('The cache saves 40% of requests. Each step is described below.')).includes('no-map'));
  assert.ok(
    !kinds(
      guide('The cache saves 40% of requests. Three steps:\n\n- Install the binary.\n- Configure the file.'),
    ).includes('no-map'),
  );
  assert.ok(!kinds(guide('The cache saves 40% of requests.', ['Install', 'Run'])).includes('no-map'), 'three sections');
});

test('a sentence about how hard the problem was, in a paper only', () => {
  const t = 'After many attempts, the bound held for every graph we tried.';
  assert.equal(quoted(t, 'hardship', 'scientific'), 'After many attempts');
  assert.match(one(t, 'hardship', 'scientific').message, /how hard this was for you/);
  assert.equal(one(t, 'hardship', 'scientific').suggestion, undefined);
  assert.ok(kinds('The proof turned out to be surprisingly difficult.', 'scientific').includes('hardship'));
  assert.ok(!kinds('The bound held on the first attempt.', 'scientific').includes('hardship'));
  assert.ok(
    !kinds('Halevi warns against “after many attempts” in a paper.', 'scientific').includes('hardship'),
    'quoted',
  );
  assert.ok(!kinds(t, 'technical').includes('hardship'), 'a guide may tell its story');
});

/** A draft that trips every check. */
const draft = `# Caching

The cache saves 40% of requests.

## Setup

There are a few things to keep in mind before going further. The service reads its settings from one file.

The file lives beside the binary. Moving it breaks nothing.

Restart the service after any change, as discussed above. After many attempts, the reload worked.

## Results

Hit rates rose by 40% in a week.

## Costs

The cache costs 2% of memory.
`;

test('an article gets none of them', () => {
  assert.deepEqual(kinds(draft, 'scientific').sort(), ['hardship', 'no-map', 'section-opening', 'vague-pointer']);
  assert.deepEqual(kinds(draft, 'technical').sort(), ['no-map', 'section-opening', 'vague-pointer']);
  assert.deepEqual(kinds(draft, 'article'), []);
});

test('the signposts reach runChecks, in the technical genres, and never break positions', () => {
  const { findings } = runChecks(draft, { genre: 'scientific' });
  for (const k of ['section-opening', 'vague-pointer', 'no-map', 'hardship'])
    assert.ok(
      findings.some((f) => f.kind === k),
      k,
    );
  for (const f of findings) assert.ok(f.from < f.to && f.to <= draft.length && draft.slice(f.from, f.to).trim());
  // The pointer outranks the style note on the same words.
  assert.ok(!findings.some((f) => f.kind === 'weak-ending' && draft.slice(f.from, f.to) === 'as discussed above'));
  const article = runChecks(draft, { genre: 'article' }).findings;
  assert.ok(!article.some((f) => ['section-opening', 'vague-pointer', 'no-map', 'hardship'].includes(f.kind)));
});
