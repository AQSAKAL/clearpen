// The goals and their example articles. Each example carries a built-in tour:
// passages planted for Clearpen's checks to catch, each with a one-line
// instruction beside it. These tests keep the tour honest: every planted
// passage is still caught under the goal's genre, and no check lands on an
// instruction line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import { runChecks } from '../src/checks.ts';
import { GOALS, goalOf, isGoal, parseExample, TOUR_MARK, tourLines } from '../src/goals.ts';

const read = (goal: (typeof GOALS)[number]) =>
  fs.readFileSync(new URL(`../../ui/src/examples/${goal.example}.md`, import.meta.url), 'utf8');

test('each goal has its own id, a genre and an example file with a title and planted passages', () => {
  assert.equal(new Set(GOALS.map((g) => g.id)).size, GOALS.length);
  assert.equal(new Set(GOALS.map((g) => g.example)).size, GOALS.length);
  for (const g of GOALS) {
    const ex = parseExample(read(g));
    assert.ok(ex.title, `${g.id}: no title`);
    assert.ok(ex.planted.length >= 4, `${g.id}: fewer than four planted passages`);
    assert.ok(!ex.content.startsWith('---'), `${g.id}: the front matter was not stripped`);
    assert.ok(ex.content.includes(TOUR_MARK), `${g.id}: no tour`);
    assert.ok(/\[[^\]]+\]/.test(ex.content), `${g.id}: no blanks to fill`);
  }
  assert.ok(isGoal('article') && !isGoal('poem'));
  assert.equal(goalOf('reflection')?.genre, 'article');
  assert.equal(goalOf('nothing'), null);
});

test('the front matter is read as written', () => {
  const ex = parseExample('---\ntitle: A title\nplanted:\n  - plain: utilise\n  - table-total: $9,500\n---\n\nBody.\n');
  assert.equal(ex.title, 'A title');
  assert.deepEqual(ex.planted, [
    { kind: 'plain', quote: 'utilise' },
    { kind: 'table-total', quote: '$9,500' },
  ]);
  assert.equal(ex.content, 'Body.\n');
  assert.deepEqual(parseExample('No front matter.'), { title: '', planted: [], content: 'No front matter.' });
  assert.deepEqual(tourLines('a\n> ✎ one\nb\n> ✎ two'), [
    { from: 2, to: 9 },
    { from: 12, to: 19 },
  ]);
});

for (const goal of GOALS) {
  test(`${goal.id}: the checks catch every planted passage, and none lands on the tour`, () => {
    const { content, planted } = parseExample(read(goal));
    const { findings } = runChecks(content, { genre: goal.genre });
    const shown = findings.map((f) => `${f.kind} “${content.slice(f.from, f.to)}”`).join('\n  ');
    for (const p of planted) {
      assert.ok(
        findings.some((f) => f.kind === p.kind && content.slice(f.from, f.to).includes(p.quote)),
        `${goal.id}: no ${p.kind} finding on “${p.quote}”. Findings:\n  ${shown}`,
      );
    }
    for (const line of tourLines(content)) {
      const on = findings.filter((f) => f.from < line.to && f.to > line.from);
      assert.equal(
        on.length,
        0,
        `${goal.id}: ${on.map((f) => f.kind).join(', ')} on the tour line “${content.slice(line.from, line.to)}”`,
      );
    }
  });
}
