// Pure logic: anchoring, streaming JSON, tidying model output, analysis,
// export, integrity and the article outline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import * as analysis from '../src/analysis.ts';
import { anchorNotes, createAnchorer, findQuote } from '../src/anchor.ts';
import { inventions, warning } from '../src/integrity.ts';
import { completedItems, completedString } from '../src/jsonstream.ts';
import { toDocument, toHTML } from '../src/markdown.ts';
import { ImageError, imageBlock, MEDIA_SRC, prepareImage } from '../src/media.ts';
import { outlineToMarkdown, sectionsOf } from '../src/outline.ts';
import { firstSentenceEnd, tidyCompletion, tidyRewrite } from '../src/tidy.ts';

const draft = fs.readFileSync(new URL('./fixtures/draft.md', import.meta.url), 'utf8');

test('quotes are found despite the ways models mangle them', () => {
  const doc = 'He said “it’s *fine*,”   and\nleft — quickly.';
  const exact = findQuote(doc, 'and\nleft')!;
  assert.equal(doc.slice(exact.from, exact.to), 'and\nleft');
  const curly = findQuote(doc, 'He said "it\'s fine," and left - quickly.')!;
  assert.equal(doc.slice(curly.from, curly.to), doc);
  assert.equal(findQuote(doc, 'nothing like this at all'), null);
});

test('long quotes with a garbled middle still anchor on their ends', () => {
  const q =
    'It is basically a way of thinking more clearly, and it is ALSO SOMETHING ELSE that the decisions that were made by the team are able to be understood';
  const hit = findQuote(draft, q);
  assert.ok(hit);
  assert.ok(draft.slice(hit.from, hit.to).startsWith('It is basically a way'));
});

test('notes are anchored in order and overlapping ones dropped', () => {
  const doc = 'Repeat this. Something else. Repeat this.';
  const placed = anchorNotes(doc, [
    { quote: 'Something else.' },
    { quote: 'Repeat this.' },
    { quote: 'else. Repeat' },
    { quote: 'missing' },
  ]);
  assert.deepEqual(
    placed.map((n) => n.from),
    [13, 29],
  );
});

test('finished items are pulled out of half-written JSON', () => {
  const partial = '{"summary": "Good \\"bones\\".", "notes": [{"quote": "a}b", "issue": "x"}, {"quote": "c", "iss';
  assert.equal(completedString(partial, 'summary'), 'Good "bones".');
  assert.deepEqual(completedItems(partial, 'notes'), [{ quote: 'a}b', issue: 'x' }]);
  assert.deepEqual(completedItems('{"notes": [', 'notes'), []);
});

test('completions fit seamlessly at the cursor and stop after a sentence', () => {
  assert.equal(tidyCompletion('value privacy and focus.', 'people who '), 'value privacy and focus.');
  assert.equal(tidyCompletion('value privacy.', 'people who'), ' value privacy.');
  assert.equal(tidyCompletion(' action. 2. **Highlight** more', 'x'), ' action.');
  assert.equal(tidyCompletion('people who value it.', 'built for people who'), ' value it.');
  assert.equal(tidyCompletion('Dr. Smith said so. Then', 'As '), 'Dr. Smith said so.');
  assert.equal(tidyCompletion('first line\nsecond', 'x '), 'first line');
  assert.equal(firstSentenceEnd('No end here'), -1);
});

test('rewrites lose the chatter models wrap around them', () => {
  assert.equal(tidyRewrite('Here is the rewritten passage:\n\nShorter text.', 'Long text.'), 'Shorter text.');
  assert.equal(tidyRewrite('"Quoted."', 'Original.'), 'Quoted.');
  assert.equal(tidyRewrite('New words', '  old words\n'), '  New words\n');
});

test('analysis counts and flags the right things', () => {
  const s = analysis.stats(draft);
  assert.ok(s.words > 250 && s.words < 320, `words ${s.words}`);
  assert.ok(s.grade > 3 && s.grade < 14);
  const hl = analysis.highlights(draft);
  const kinds = analysis.countByKind(hl);
  assert.ok(kinds.cliche >= 1, 'flags the cliché');
  assert.ok(kinds.passive >= 1, 'flags passive voice');
  assert.ok(kinds.vlong >= 1, 'flags the very long sentence');
  assert.ok(
    !hl.some((r) => r.kind === 'adverb' && /basically/i.test(draft.slice(r.from, r.to))),
    'filler is not double-flagged as an adverb',
  );
  for (const r of hl) assert.ok(r.from < r.to && r.to <= draft.length);
  assert.deepEqual(
    analysis.headings(draft).map((h) => h.level),
    [1, 2, 2],
  );
  assert.equal(analysis.stats('').words, 0);
});

test('code blocks are not analysed as prose', () => {
  const md =
    'Real prose here is fine.\n\n```\nthis was written by a very long code comment that goes on and on and on and on and on and on and on and on forever\n```\n';
  assert.ok(!analysis.highlights(md).some((r) => r.from > 26));
});

test('Markdown export is faithful and safe', () => {
  const html = toHTML(
    '# T\n\nA **b**, *c* and [x](https://y.z).\n\n- one\n- two\n\n1. first\n\n> quote\n\n```\n<b>code</b>\n```\n\n<script>alert(1)</script> [bad](javascript:alert(1))',
  );
  assert.match(html, /<h1>T<\/h1>/);
  assert.match(html, /<strong>b<\/strong>/);
  assert.match(html, /<em>c<\/em>/);
  assert.match(html, /<a href="https:\/\/y.z">x<\/a>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>quote<\/p><\/blockquote>/);
  assert.match(html, /&lt;b&gt;code&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /(href|src)="javascript/i);
  // A link nested in an image's alt text once broke out of the attribute.
  const evil = toHTML("![[x](/nope) z](#a/onerror=location='javascript:alert%281%29'//)");
  assert.doesNotMatch(evil, /<img[^>]*\sonerror=/i);
  assert.match(toHTML('[p](//evil.com)'), /href="#"/);
  assert.match(toDocument('A <title>', 'Body'), /<title>A &lt;title&gt;<\/title>/);
});

test('the analysis never produces positions beyond the text', () => {
  const t = 'İzmir is just great. It is very nice, basically.';
  const hl = analysis.highlights(t);
  assert.ok(hl.length >= 2);
  for (const r of hl) assert.ok(r.to <= t.length && t.slice(r.from, r.to).trim(), JSON.stringify(r));
});

test('streamed review notes are placed in order without overlaps', () => {
  const place = createAnchorer('Repeat this. Something else. Repeat this.');
  assert.equal(place({ quote: 'Something else.' })?.from, 13);
  assert.equal(place({ quote: 'Repeat this.' })?.from, 29, 'a later note lands on the later occurrence');
  assert.equal(place({ quote: 'else. Repeat' }), null, 'overlaps are dropped');
});

test('a passage that really starts "Here is" keeps its opening', () => {
  assert.equal(
    tidyRewrite('Here is the plan: we leave at dawn.', 'Here is the plan: we leave at noon.'),
    'Here is the plan: we leave at dawn.',
  );
});

test('sentences survive decimals, abbreviations, versions, code and tables', () => {
  const split = (t: string) => analysis.sentences(t).map((s) => s.text);
  assert.deepEqual(split('Corvane trades at $42.10, or 11.5x EV/EBITDA and 18.2x P/E. Our target is $58.00.'), [
    'Corvane trades at $42.10, or 11.5x EV/EBITDA and 18.2x P/E.',
    'Our target is $58.00.',
  ]);
  assert.deepEqual(split('Revenue grew 14.5% y/y, i.e. $1.2M vs. $1.05M. Mr. Lee approved it.'), [
    'Revenue grew 14.5% y/y, i.e. $1.2M vs. $1.05M.',
    'Mr. Lee approved it.',
  ]);
  assert.deepEqual(
    split('Run `nimbus keys rotate --expire 30d` on v2.3.1. The key lives in `~/.nimbus/config.json`.'),
    ['Run `nimbus keys rotate --expire 30d` on v2.3.1.', 'The key lives in `~/.nimbus/config.json`.'],
  );
  assert.deepEqual(split('J. R. R. Tolkien wrote it. See Fig. 3 for details.'), [
    'J. R. R. Tolkien wrote it.',
    'See Fig. 3 for details.',
  ]);
  assert.deepEqual(split('| A | B |\n|---|---|\n| 1.5 | 2.5 |\n\nAfter the table.'), ['After the table.']);
  // Code inside a sentence is neither graded nor flagged.
  assert.ok(!analysis.highlights('Call `is_deprecated_flagged()` today.').length);
});

test('a dense financial paragraph is not graded as easy reading', () => {
  const p =
    'Corvane Systems trades at 11.5x consensus FY2025 EV/EBITDA and 18.2x P/E, a discount of roughly 22% to its closest peers despite superior free-cash-flow conversion. Our base case assumes revenue compounds at 14.5% through FY2027 as the installed base migrates to subscription pricing, which supports a price target of $58.00 against a current price of $42.10.';
  const s = analysis.stats(p);
  assert.equal(s.sentences, 2);
  assert.ok(s.grade >= 10, `grade ${s.grade}`); // was graded 0 ("very easy") when decimals split sentences
});

test('exported tables, callouts and numbered steps keep their structure', () => {
  const html = toHTML(
    '| Metric | FY2024A |\n|:---|---:|\n| Revenue | 412.5 |\n\n> [!WARNING]\n> Careful.\n\n1. Install:\n\n   ```bash\n   npm i -g nimbus\n   ```\n\n2. Log in.\n\n5. Five\n6. Six',
  );
  assert.match(
    html,
    /<table><thead><tr><th style="text-align:left">Metric<\/th><th style="text-align:right">FY2024A<\/th>/,
  );
  assert.match(html, /<td style="text-align:right">412.5<\/td>/);
  assert.match(
    html,
    /<blockquote class="callout warning"><p><strong>Warning<\/strong><\/p><p>Careful.<\/p><\/blockquote>/,
  );
  assert.match(
    html,
    /<ol><li>Install:<pre><code class="language-bash">npm i -g nimbus<\/code><\/pre><\/li><li>Log in.<\/li><li>Five<\/li><li>Six<\/li><\/ol>/,
  );
  assert.match(toHTML('3. Three\n4. Four'), /<ol start="3">/);
});

test('changed, dropped and invented figures are always flagged', () => {
  assert.equal(
    warning('Revenue grew 14.5% to $1.2M in Q3 FY2025.', 'Revenue rose 15% to $1.2M in Q3 FY2025.'),
    'Check: 14.5% → 15%',
  );
  assert.equal(
    warning('Trades at 11.5x (NASDAQ: CRVN), target $58.', 'At 11.5x (NASDAQ: CRVN) it has a $58 target.'),
    '',
  );
  assert.equal(
    warning('Costs were $1,200.', 'Costs were $1200.'),
    '',
    'thousands separators are formatting, not a change',
  );
  assert.match(
    warning('Run `nimbus keys rotate --expire 30d` on v2.3.1.', 'Run `nimbus key rotate --expire 30d` on v2.3.1.'),
    /nimbus keys rotate/,
  );
  assert.equal(warning('Upgrade to v2.3.1 now.', 'Upgrade to v2.3 now.'), 'Check: v2.3.1 → v2.3');
  assert.equal(
    warning('1. Install it.\n2. Run it.', '1. Install the CLI.\n2. Run it.'),
    '',
    'list numbering is structure',
  );
  assert.equal(warning('Probabilities: 50% base, 30% bull.', 'Probabilities: base 50%.'), 'Check: drops 30%');
  assert.deepEqual(inventions('Studies show 47% of teams agree, in a $3.2B market.', 'Notes: the market is $3.2B.'), [
    '47%',
  ]);
});

test('code fences that belong to the passage survive a rewrite', () => {
  const endsInCode = 'Add it to your env:\n\n```bash\necho KEY >> .env\n```';
  assert.equal(
    tidyRewrite('Add it to the env file:\n\n```bash\necho KEY >> .env\n```', endsInCode),
    'Add it to the env file:\n\n```bash\necho KEY >> .env\n```',
  );
  const startsWithCode = '```bash\nnimbus keys rotate x\n```\nThen restart.';
  assert.equal(
    tidyRewrite('```bash\nnimbus keys rotate x\n```\nThen restart it.', startsWithCode),
    '```bash\nnimbus keys rotate x\n```\nThen restart it.',
  );
  assert.equal(
    tidyRewrite('```\nA plain sentence, rewritten.\n```', 'A plain sentence.'),
    'A plain sentence, rewritten.',
  );
});

test('the article is its own outline: sections, their notes, and what is still to write', () => {
  const text = [
    '# A title is not a section',
    '',
    '## Why pain matters',
    '',
    '- Pain is a signal',
    '- Ignoring it stalls growth',
    '',
    '## Written already',
    '',
    'A real paragraph lives here.',
    '',
    '- and a list after it',
    '',
    '## Empty heading',
    '',
    '### A sub-section',
    '',
    '```',
    '## not a heading inside code',
    '```',
  ].join('\n');
  const s = sectionsOf(text);
  assert.deepEqual(
    s.map((x) => [x.heading, x.written, x.points.length]),
    [
      ['Why pain matters', false, 2],
      ['Written already', true, 1],
      ['Empty heading', false, 0],
      ['A sub-section', true, 0],
    ],
  );
  assert.equal(text.slice(s[0]!.pointsFrom!, s[0]!.pointsTo!), '- Pain is a signal\n- Ignoring it stalls growth');
  assert.equal(text.slice(s[2]!.headingFrom, s[2]!.headingTo), '## Empty heading');
  assert.equal(s[2]!.pointsFrom, null);
  assert.equal(
    outlineToMarkdown({
      sections: [
        { heading: 'One', points: ['a', 'b'] },
        { heading: 'Two', points: [] },
      ],
    }),
    '## One\n\n- a\n- b\n\n## Two',
  );
});

test('images: relative media paths map through imageSrc, and only safe results render', () => {
  const md = '![chart](media/ab12.png)\n\n![x](media/evil.png)\n\n![gone](media/none.png)';
  const html = toHTML(md, {
    imageSrc: (src) =>
      src === 'media/ab12.png'
        ? 'asset://localhost/lib/media/ab12.png'
        : src === 'media/evil.png'
          ? 'javascript:alert(1)'
          : null,
  });
  assert.match(html, /<img src="asset:\/\/localhost\/lib\/media\/ab12.png" alt="chart">/);
  assert.match(html, /<img src="#" alt="x">/);
  assert.match(html, /<p>gone<\/p>/);
  // Without a resolver, a relative path isn't a URL the page can trust.
  assert.match(toHTML('![a](media/ab12.png)'), /src="#"/);
  assert.match(
    toDocument('T', '![a](media/x.png)', { imageSrc: () => 'data:image/png;base64,AAAA' }),
    /data:image\/png;base64,AAAA/,
  );
});

test('countWords counts words the way stats does, ignoring Markdown and image paths', () => {
  const text = '# Title\n\nTwo **words** ![alt text](media/x.png)';
  assert.equal(analysis.countWords(text), 5);
  assert.equal(analysis.countWords(text), analysis.stats(text).words);
});

test('images: prepared by content, and placed in a paragraph of their own', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
  const img = await prepareImage(new Blob([png]));
  assert.equal(img.ext, 'png');
  assert.equal(img.type, 'image/png');
  assert.match(img.src, MEDIA_SRC);
  assert.equal((await prepareImage(new Blob([png]))).sha256, img.sha256);
  await assert.rejects(prepareImage(new Blob(['<svg onload=alert(1)>'])), ImageError);

  assert.equal(imageBlock('One.', 4, 4, ['![a](media/x.png)']), '\n\n![a](media/x.png)\n');
  assert.equal(imageBlock('One.\n\nTwo.', 6, 6, ['![a](media/x.png)']), '![a](media/x.png)\n\n');
  assert.equal(imageBlock('', 0, 0, ['![a](m)', '![b](n)']), '![a](m)\n\n![b](n)\n');
});
