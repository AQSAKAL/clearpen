// Tracked suggestions: how they follow edits, and how a group is accepted.

import { describe, expect, test, vi } from 'vitest';
import { all, mount, mousedown, press } from './helpers.ts';

describe('mapping through edits', () => {
  const doc = 'The quick brown fox.';
  const at = (word: string) => ({ from: doc.indexOf(word), to: doc.indexOf(word) + word.length });

  test('an edit before the passage moves it along', () => {
    const ed = mount(doc);
    const id = ed.addSuggestion({ ...at('quick'), insert: 'slow', status: 'ready' });
    ed.insertAt(0, 'Oh. ');
    const s = ed.suggestion(id)!;
    expect(ed.slice(s.from, s.to)).toBe('quick');
    expect(s.from).toBe(8);
  });

  test('text typed right at either edge stays outside the passage', () => {
    const ed = mount(doc);
    const id = ed.addSuggestion({ ...at('quick'), insert: 'slow', status: 'ready' });
    ed.insertAt(at('quick').from, 'very ');
    expect(ed.slice(ed.suggestion(id)!.from, ed.suggestion(id)!.to)).toBe('quick');
    ed.insertAt(ed.suggestion(id)!.to, 'ish');
    expect(ed.getText()).toBe('The very quickish brown fox.');
    expect(ed.slice(ed.suggestion(id)!.from, ed.suggestion(id)!.to)).toBe('quick');
  });

  test('editing inside the passage voids the suggestion', () => {
    const ed = mount(doc);
    const id = ed.addSuggestion({ ...at('quick'), insert: 'slow', status: 'ready' });
    ed.replace(at('quick').from + 1, at('quick').from + 2, 'w');
    expect(ed.suggestion(id)).toBeNull();
  });

  test('a pure insertion follows text typed at its point', () => {
    const ed = mount(doc);
    const id = ed.addSuggestion({ from: 4, to: 4, insert: 'very ', status: 'ready' });
    ed.insertAt(4, 'so ');
    expect(ed.suggestion(id)).toMatchObject({ from: 7, to: 7 });
  });

  test('deleting across the passage voids the suggestion', () => {
    const ed = mount(doc);
    const id = ed.addSuggestion({ ...at('quick'), insert: 'slow', status: 'ready' });
    ed.replace(at('quick').from - 1, at('quick').to + 1, '');
    expect(ed.suggestion(id)).toBeNull();
  });
});

describe('acceptSuggestions', () => {
  const doc = 'one two three four';

  test('applies a group in one undoable step, skipping members that overlap', () => {
    const onAccept = vi.fn();
    const ed = mount(doc, { onAccept });
    const a = ed.addSuggestion({ from: 0, to: 3, insert: 'ONE', status: 'ready', group: 'g', compact: true });
    const b = ed.addSuggestion({ from: 2, to: 7, insert: 'XX', status: 'ready', group: 'g', compact: true });
    const c = ed.addSuggestion({ from: 8, to: 13, insert: 'THREE', status: 'ready', group: 'g', compact: true });
    // Out of order on purpose: they're applied left to right.
    ed.acceptSuggestions([c, b, a]);
    expect(ed.getText()).toBe('ONE two THREE four');
    expect(ed.suggestions()).toEqual([]);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(a, expect.objectContaining({ id: a, count: 2 }));
    ed.undo();
    expect(ed.getText()).toBe(doc);
  });

  test('voids other suggestions the accepted changes touch, and keeps the rest', () => {
    const ed = mount(doc);
    const a = ed.addSuggestion({ from: 0, to: 3, insert: 'ONE', status: 'ready', group: 'g' });
    const touching = ed.addSuggestion({ from: 3, to: 4, insert: '-', status: 'ready' });
    const apart = ed.addSuggestion({ from: 14, to: 18, insert: 'FOUR', status: 'ready' });
    ed.acceptSuggestions([a]);
    expect(ed.suggestion(touching)).toBeNull();
    expect(ed.slice(ed.suggestion(apart)!.from, ed.suggestion(apart)!.to)).toBe('four');
  });

  test('does nothing for ids it does not know', () => {
    const onAccept = vi.fn();
    const ed = mount(doc, { onAccept });
    ed.acceptSuggestions(['nope']);
    expect(ed.getText()).toBe(doc);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('the keyboard acts on the latest group', () => {
  test('⌘↵ accepts the latest group; streaming suggestions are passed over', () => {
    const ed = mount('alpha beta gamma');
    ed.addSuggestion({ from: 0, to: 5, insert: 'A', status: 'ready', group: 'g1' });
    ed.addSuggestion({ from: 6, to: 10, insert: 'B', status: 'ready', group: 'g1' });
    ed.addSuggestion({ from: 11, to: 16, insert: 'G', status: 'streaming' });
    expect(press(ed, 'Enter', { mod: true })).toBe(true);
    expect(ed.getText()).toBe('A B gamma');
    expect(ed.suggestions()).toHaveLength(1);
  });

  test('Esc rejects the latest group and leaves the text alone', () => {
    const onReject = vi.fn();
    const ed = mount('alpha beta gamma', { onReject });
    const first = ed.addSuggestion({ from: 0, to: 5, insert: 'A', status: 'ready' });
    const g = ed.addSuggestion({ from: 6, to: 10, insert: 'B', status: 'ready', group: 'g2' });
    ed.addSuggestion({ from: 11, to: 16, insert: 'G', status: 'ready', group: 'g2' });
    expect(press(ed, 'Escape')).toBe(true);
    expect(ed.getText()).toBe('alpha beta gamma');
    expect(ed.suggestions().map((s) => s.id)).toEqual([first]);
    expect(onReject).toHaveBeenCalledWith(g, expect.objectContaining({ id: g }));
  });

  test('with nothing pending, Esc is left to other bindings', () => {
    const ed = mount('alpha');
    expect(press(ed, 'Escape')).toBe(false);
  });
});

describe('widgets', () => {
  test('a full suggestion shows its label, warning and Accept / Reject', () => {
    const onAccept = vi.fn();
    const ed = mount('Some old words here.', { onAccept });
    const id = ed.addSuggestion({
      from: 5,
      to: 14,
      insert: 'new text',
      label: 'Shorter',
      status: 'ready',
      warning: 'adds a figure',
    });
    expect(all(ed, '.cm-sug-del').map((el) => el.textContent)).toEqual(['old words']);
    expect(all(ed, '.cm-sug-label')[0]?.textContent).toBe('Shorter');
    expect(all(ed, '.cm-sug-warn')[0]?.textContent).toBe('⚠ adds a figure');
    expect(all(ed, '.cm-sug-bar button').map((b) => b.textContent)).toEqual(['Accept', 'Reject']);
    mousedown(all(ed, '.cm-sug-accept')[0]!);
    expect(ed.getText()).toBe('Some new text here.');
    expect(ed.cursor()).toBe(5 + 'new text'.length);
    expect(onAccept).toHaveBeenCalledWith(id, expect.objectContaining({ id, insert: 'new text' }));
  });

  test('a full suggestion that deletes shows ∅; a compact one shows nothing', () => {
    const ed = mount('Cut this. Keep this.');
    ed.addSuggestion({ from: 0, to: 9, insert: '', status: 'ready' });
    expect(all(ed, '.cm-sug-text')[0]?.textContent).toBe('∅');
    ed.setText('Cut this. Keep this.');
    ed.addSuggestion({ from: 0, to: 9, insert: '', status: 'ready', compact: true });
    expect(all(ed, '.cm-sug-text')[0]?.textContent).toBe('');
  });

  test('a compact suggestion shows ✓ ✕ and its warning as ⚠ with a title', () => {
    const ed = mount('It cost $5 then.');
    ed.addSuggestion({ from: 8, to: 10, insert: '$6', status: 'ready', compact: true, warning: 'a figure changed' });
    expect(all(ed, '.cm-sug-mini button').map((b) => b.textContent)).toEqual(['✓', '✕']);
    const warn = all(ed, '.cm-sug-mini .cm-sug-warn')[0] as HTMLElement;
    expect(warn.textContent).toBe('⚠');
    expect(warn.title).toBe('a figure changed');
    expect(all(ed, '.cm-sug-bar')).toHaveLength(0);
  });

  test("a compact insert ending in a line break keeps its ✓ ✕ on the heading's line", () => {
    const ed = mount('Intro.\n\nBody.');
    ed.addSuggestion({ from: 8, to: 8, insert: '## Heading\n\n', status: 'ready', compact: true });
    const wrap = all(ed, '.cm-sug-ins')[0]!;
    expect([...wrap.children].map((c) => c.className)).toEqual(['cm-sug-text', 'cm-sug-mini', 'cm-sug-text']);
    expect(wrap.children[0]?.textContent).toBe('## Heading');
    expect(wrap.children[2]?.textContent).toBe('\n\n');
  });

  test('a streaming suggestion has no buttons until it is ready', () => {
    const ed = mount('Rewrite me.');
    const id = ed.addSuggestion({ from: 0, to: 11, label: 'Clearer' });
    expect(all(ed, '.cm-sug-ins.streaming')).toHaveLength(1);
    expect(all(ed, 'button')).toHaveLength(0);
    ed.updateSuggestion(id, { insert: 'Rewritten.', status: 'ready' });
    expect(all(ed, '.cm-sug-ins.streaming')).toHaveLength(0);
    expect(all(ed, '.cm-sug-bar button')).toHaveLength(2);
    expect(all(ed, '.cm-sug-text')[0]?.textContent).toBe('Rewritten.');
  });
});
