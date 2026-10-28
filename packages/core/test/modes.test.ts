// Writing modes: a preset bundles the genre with the aids, the review's
// reading and, for some, a template — and an older brief that names only a
// genre still finds its mode.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GENRES, runChecks } from '../src/checks.ts';
import { briefForMode, checkOptions, MODE, MODE_GROUPS, MODES, modeOf } from '../src/modes.ts';
import { READERS, reviewMessages, thinkMessages } from '../src/prompts.ts';

test('every mode names a genre, every genre is a mode, and the picker lists each mode once', () => {
  for (const id of MODES) {
    const m = MODE[id];
    assert.equal(m.id, id);
    assert.ok((GENRES as readonly string[]).includes(m.genre), `${id} has a genre`);
    assert.ok(m.label && m.hint, `${id} has a label and a hint`);
  }
  for (const g of GENRES) assert.equal(MODE[g].genre, g);
  assert.deepEqual([...MODE_GROUPS.flatMap(([, ids]) => ids)].sort(), [...MODES].sort());
});

test('the mode comes from the brief, else from its genre, else it is an article', () => {
  assert.equal(modeOf({ mode: 'reflect' }).id, 'reflect');
  assert.equal(modeOf({ genre: 'scientific' }).id, 'scientific');
  assert.equal(modeOf({ mode: 'clear', genre: 'scientific' }).id, 'clear', 'the mode wins');
  assert.equal(modeOf({ mode: 'letter' }).id, 'article');
  assert.equal(modeOf({}).id, 'article');
  assert.equal(modeOf().id, 'article');
  assert.deepEqual(briefForMode('problem'), { mode: 'problem', genre: 'article' });
  assert.deepEqual(briefForMode('investment'), { mode: 'investment', genre: 'investment' });
});

test('free writing turns Clearpen’s checks and the next sentence off; the other modes keep them', () => {
  const text =
    'We utilise the system every day. Every customer agrees that this is a significant result.\n\n| Item | Cost |\n|---|---|\n| A | $100 |\n| B | $200 |\n| Total | $400 |\n';
  const kinds = (r: ReturnType<typeof runChecks>) => r.findings.map((f) => f.kind);
  assert.deepEqual(kinds(runChecks(text, checkOptions({ mode: 'article' }))), [
    'plain',
    'generalisation',
    'table-total',
  ]);
  assert.deepEqual(kinds(runChecks(text, checkOptions({ genre: 'scientific' }))), [
    'plain',
    'generalisation',
    'significant',
    'table-total',
  ]);
  for (const mode of ['clear', 'reflect', 'problem'] as const) {
    assert.deepEqual(runChecks(text, checkOptions({ mode })), { findings: [], facts: [] }, mode);
    assert.equal(MODE[mode].checks, false);
    assert.deepEqual(MODE[mode].aids, { next: false, typos: true, style: false });
    assert.equal(MODE[mode].review, 'listener');
  }
  // Style off on its own keeps what the text gets wrong and drops how it reads.
  assert.deepEqual(kinds(runChecks(text, { genre: 'article', style: false })), ['generalisation', 'table-total']);
  assert.deepEqual(checkOptions({ mode: 'scientific', notes: 'my notes' }), {
    genre: 'scientific',
    sources: 'my notes',
    checks: true,
    style: true,
  });
  assert.equal(MODE.reflect.template?.start, 'now');
  assert.equal(MODE.scientific.template?.start, 'offer');
  assert.equal(MODE.article.template, undefined);
});

test('the review listens in a free-writing mode and edits in the others; the coach is told what the author is doing', () => {
  const [system, user] = reviewMessages({ content: 'x', brief: { mode: 'clear' } });
  assert.match(system!.content, /listener, not an editor/);
  assert.match(system!.content, /never correct the prose/);
  assert.doesNotMatch(system!.content, /Read at three levels/);
  assert.match(user!.content, /Listen to this draft/);
  assert.match(user!.content, /"idea" for an idea worth following/);
  assert.match(user!.content, /"suggestion": always ""/);
  assert.doesNotMatch(user!.content, /also check the opening/);
  const [editor, ask] = reviewMessages({ content: 'x', brief: { mode: 'scientific' } });
  assert.ok(editor!.content.includes(READERS.scientific!));
  assert.match(ask!.content, /also check the opening/);
  assert.match(ask!.content, /"category": one of clarity, concision, structure, evidence, tone, grammar, style;/);
  assert.match(
    thinkMessages({ kind: 'next', brief: { mode: 'reflect' } })[1]!.content,
    /writing to think, not to publish/,
  );
  assert.doesNotMatch(thinkMessages({ kind: 'next' })[1]!.content, /writing to think/);
});
