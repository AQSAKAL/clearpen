// Autocorrect's fixes: one undo step each, underlined for a moment, never on
// words the writer put back, and the cursor and ghost text move with them.

import { describe, expect, test, vi } from 'vitest';
import { FIX_SHOWN_MS } from '../src/corrections.ts';
import { all, mount } from './helpers.ts';

const type = (ed: ReturnType<typeof mount>, text: string) => {
  const end = ed.length();
  ed.view.dispatch({
    changes: { from: end, insert: text },
    selection: { anchor: end + text.length },
    userEvent: 'input.type',
  });
};

describe('autocorrect fixes', () => {
  test('are their own undo step, and an undone fix is never made again', () => {
    const ed = mount('');
    type(ed, 'this is mi film.');
    expect(
      ed.correct([
        { from: 0, to: 4, insert: 'This' },
        { from: 8, to: 10, insert: 'my' },
      ]),
    ).toBe(2);
    type(ed, ' Ok');
    expect(ed.getText()).toBe('This is my film. Ok');
    expect(all(ed, '.cm-fixed').map((el) => [el.textContent, el.getAttribute('title')])).toEqual([
      ['This', 'Corrected from “this”'],
      ['my', 'Corrected from “mi”'],
    ]);
    ed.undo();
    expect(ed.getText()).toBe('This is my film.');
    ed.undo();
    // The writer's own words are back.
    expect(ed.getText()).toBe('this is mi film.');
    expect(ed.correct([{ from: 8, to: 10, insert: 'my' }])).toBe(0);
    expect(ed.getText()).toBe('this is mi film.');
  });

  test('move the cursor and the ghost text with them', () => {
    const onUpdate = vi.fn();
    const ed = mount('', { onUpdate });
    type(ed, 'I dont know. ');
    ed.showGhost(ed.length(), 'Next.');
    ed.correct([{ from: 2, to: 6, insert: "don't" }]);
    expect(ed.cursor()).toBe(ed.length());
    expect(ed.ghost()).toEqual({ pos: ed.length(), text: 'Next.', display: '' });
    const u = onUpdate.mock.lastCall![0];
    expect(u).toMatchObject({ docChanged: true, corrected: true, userEdit: false });
    expect(u.mapPos(13)).toBe(14);
  });

  test('stay out of code, links’ addresses and overlapping fixes', () => {
    const ed = mount('Run `teh` here and see https://exmaple.com now.');
    expect(ed.isProse(0, 3)).toBe(true);
    expect(ed.isProse(5, 8)).toBe(false);
    expect(ed.correct([{ from: 5, to: 8, insert: 'the' }])).toBe(0);
    expect(ed.correct([{ from: 31, to: 38, insert: 'example' }])).toBe(0);
    expect(
      ed.correct([
        { from: 0, to: 3, insert: 'Ran' },
        { from: 1, to: 3, insert: 'xx' },
      ]),
    ).toBe(1);
    expect(ed.getText().startsWith('Ran `teh`')).toBe(true);
  });

  test('are underlined only for a moment', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const ed = mount('teh end.');
      ed.correct([{ from: 0, to: 3, insert: 'the' }]);
      expect(all(ed, '.cm-fixed')).toHaveLength(1);
      vi.advanceTimersByTime(FIX_SHOWN_MS + 10);
      expect(all(ed, '.cm-fixed')).toHaveLength(0);
      expect(ed.getText()).toBe('the end.');
    } finally {
      vi.useRealTimers();
    }
  });
});
