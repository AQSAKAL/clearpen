// Ghost text: shown at the cursor, gone on any edit or move, taken with Tab or ⌘→.

import { describe, expect, test, vi } from 'vitest';
import { all, mount, press } from './helpers.ts';

const HINT = ' ¶ point made · Tab for new paragraph';

describe('ghost text', () => {
  test('shows at the cursor', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    ed.showGhost(10, ' value privacy.');
    expect(all(ed, '.cm-ghost').map((el) => el.textContent)).toEqual([' value privacy.']);
    expect(ed.ghost()).toEqual({ pos: 10, text: ' value privacy.', display: '' });
  });

  test('is cleared by an edit', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    ed.showGhost(10, ' value privacy.');
    ed.insertAt(0, 'All ');
    expect(ed.ghost()).toBeNull();
    expect(all(ed, '.cm-ghost')).toHaveLength(0);
  });

  test('is cleared by a cursor move, but not by a selection that leaves the cursor put', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    ed.showGhost(10, ' value privacy.');
    ed.setSelection(10);
    expect(ed.ghost()).not.toBeNull();
    ed.setSelection(3);
    expect(ed.ghost()).toBeNull();
  });

  test('a hint shows its display text, and taking it replaces the space before the cursor', () => {
    const onUpdate = vi.fn();
    const ed = mount('A point made. ', { onUpdate });
    ed.setSelection(14);
    ed.showGhost(14, '\n\n', HINT);
    expect(all(ed, '.cm-ghost.cm-ghost-hint').map((el) => el.textContent)).toEqual([HINT]);
    expect(ed.acceptGhost()).toBe(true);
    expect(ed.getText()).toBe('A point made.\n\n');
    expect(ed.cursor()).toBe(15);
    expect(ed.ghost()).toBeNull();
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ docChanged: true, ghostAccepted: true }));
  });

  test('a hint without a space before it is inserted at the cursor', () => {
    const ed = mount('A point made.');
    ed.setSelection(13);
    ed.showGhost(13, '\n\n', HINT);
    ed.acceptGhost();
    expect(ed.getText()).toBe('A point made.\n\n');
  });

  test('⌘→ takes one word and leaves the rest showing', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    ed.showGhost(10, ' value privacy and focus.');
    expect(press(ed, 'ArrowRight', { mod: true })).toBe(true);
    expect(ed.getText()).toBe('People who value ');
    expect(ed.cursor()).toBe(17);
    expect(ed.ghost()).toEqual({ pos: 17, text: 'privacy and focus.' });
    expect(all(ed, '.cm-ghost').map((el) => el.textContent)).toEqual(['privacy and focus.']);
    expect(ed.acceptGhost()).toBe(true);
    expect(ed.getText()).toBe('People who value privacy and focus.');
    expect(ed.ghost()).toBeNull();
  });

  test('⌘→ leaves a hint alone: it is not words', () => {
    const ed = mount('A point made. ');
    ed.setSelection(14);
    ed.showGhost(14, '\n\n', HINT);
    press(ed, 'ArrowRight', { mod: true });
    expect(ed.getText()).toBe('A point made. ');
    expect(ed.ghost()?.display).toBe(HINT);
  });

  test('Esc clears it before anything else', () => {
    const ed = mount('Some text');
    ed.addSuggestion({ from: 0, to: 4, insert: 'More', status: 'ready' });
    ed.setSelection(9);
    ed.showGhost(9, ' and more.');
    expect(press(ed, 'Escape')).toBe(true);
    expect(ed.ghost()).toBeNull();
    expect(ed.suggestions()).toHaveLength(1);
  });

  test('a frame shows the sentence to complete with its blank, and nothing takes it', () => {
    const ed = mount('');
    ed.setSelection(0);
    ed.showGhost(0, '', 'I feel ___ today.', 'frame');
    expect(all(ed, '.cm-ghost.cm-ghost-frame').map((el) => el.textContent)).toEqual(['I feel  today.']);
    expect(all(ed, '.cm-ghost-blank')).toHaveLength(1);
    expect(ed.ghost()).toEqual({ pos: 0, text: '', display: 'I feel ___ today.', kind: 'frame' });
    expect(ed.acceptGhost()).toBe(false);
    press(ed, 'Tab');
    press(ed, 'ArrowRight', { mod: true });
    expect(ed.getText()).toBe('');
    expect(ed.ghost()).not.toBeNull();
    // The first keystroke takes it away: the author types the whole sentence.
    ed.insertAt(0, 'I');
    expect(ed.ghost()).toBeNull();
    expect(all(ed, '.cm-ghost')).toHaveLength(0);
  });

  test('clearGhost and acceptGhost with nothing showing', () => {
    const ed = mount('Text');
    ed.clearGhost();
    expect(ed.acceptGhost()).toBe(false);
    expect(ed.getText()).toBe('Text');
  });
});
